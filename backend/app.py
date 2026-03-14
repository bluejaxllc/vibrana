"""
Vibrana Backend — Flask API Server
Full-featured API with SQLAlchemy persistence, scan analysis, and export capabilities.
"""
from flask import Flask, jsonify, request, Response, send_file, send_from_directory
from flask_cors import CORS
from cv_engine import NLSAutomation
from screen_watcher import ScreenWatcher
from database import init_db, SessionLocal
from models import Patient, ScanResult, User, AuditLog, Team, TeamMember, DiagnosticLog
from auth import hash_password, check_password, generate_token, require_auth, require_role
from licensing import init_license, get_license_status, activate_license, deactivate_license, require_tier, check_patient_limit, get_current_tier
import cv2
import csv
import io
import time
from datetime import datetime, date

import os

app = Flask(__name__)
CORS(app, origins=os.environ.get('CORS_ORIGINS',
    'http://localhost:5173,http://localhost:5176,http://localhost:5177,https://vibrana.vercel.app,https://vibrana.bluejax.ai').split(','))

# Initialize database
init_db()

# Initialize license system
init_license()

# Initialize NLS automation bot
print("Initializing NLSAutomation bot...")
try:
    bot = NLSAutomation()
    print("Bot initialized successfully.")
except Exception as e:
    print(f"Failed to initialize bot: {e}")
    bot = None




# ──────────────────────────────────────
# Helper: get DB session
# ──────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise

# Initialize screen watcher with DB access for auto-logging
watcher = ScreenWatcher(bot, db_factory=get_db) if bot else None


# ──────────────────────────────────────
# STATUS
# ──────────────────────────────────────
@app.route('/status', methods=['GET'])
def get_status():
    return jsonify({"status": "idle", "message": "Vibrana Overseer Ready", "bot_online": bot is not None, "license_tier": get_current_tier()})


# ──────────────────────────────────────
# LICENSE
# ──────────────────────────────────────
@app.route('/license/status', methods=['GET'])
def license_status():
    return jsonify(get_license_status())


@app.route('/license/activate', methods=['POST'])
def license_activate():
    data = request.json or {}
    key = data.get('license_key', '').strip()
    result = activate_license(key)
    if result.get('success'):
        return jsonify(result)
    return jsonify(result), 400


@app.route('/license/deactivate', methods=['POST'])
def license_deactivate():
    return jsonify(deactivate_license())


# ──────────────────────────────────────
# STATS (Dashboard widgets)
# ──────────────────────────────────────
@app.route('/stats', methods=['GET'])
def get_stats():
    db = get_db()
    try:
        total_patients = db.query(Patient).count()
        total_scans = db.query(ScanResult).count()

        today = datetime.combine(date.today(), datetime.min.time())
        scans_today = db.query(ScanResult).filter(ScanResult.timestamp >= today).count()

        # Recent activity
        recent_scans = db.query(ScanResult).order_by(ScanResult.timestamp.desc()).limit(5).all()
        recent_activity = [{
            "id": s.id,
            "organ_name": s.organ_name,
            "status": s.status,
            "timestamp": s.timestamp.isoformat() if s.timestamp else None,
            "patient_name": s.patient.name if s.patient else "Unknown"
        } for s in recent_scans]

        return jsonify({
            "total_patients": total_patients,
            "total_scans": total_scans,
            "scans_today": scans_today,
            "bot_online": bot is not None,
            "recent_activity": recent_activity
        })
    finally:
        db.close()


# ──────────────────────────────────────
# TEAMS — CRUD (Phase 12)
# ──────────────────────────────────────
@app.route('/teams', methods=['GET'])
@require_tier('teams')
def get_teams():
    db = get_db()
    try:
        teams = db.query(Team).all()
        result = []
        for t in teams:
            d = t.to_dict()
            # Frontend expects team_id / team_name keys
            d['team_id'] = d['id']
            d['team_name'] = d['name']
            # Attach role info (default to owner for now since no auth context)
            d['role'] = 'owner'
            result.append(d)
        return jsonify(result)
    finally:
        db.close()


@app.route('/teams', methods=['POST'])
@require_tier('teams')
def create_team():
    db = get_db()
    try:
        data = request.json
        team = Team(name=data.get('name', 'New Team'))
        db.add(team)
        db.commit()
        db.refresh(team)
        d = team.to_dict()
        d['team_id'] = d['id']
        d['team_name'] = d['name']
        d['role'] = 'owner'
        return jsonify(d), 201
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        db.close()


@app.route('/teams/<team_id>/members', methods=['GET'])
def get_team_members(team_id):
    db = get_db()
    try:
        members = db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
        return jsonify([m.to_dict() for m in members])
    finally:
        db.close()


@app.route('/teams/<team_id>/invite', methods=['POST'])
@require_tier('teams')
def invite_team_member(team_id):
    db = get_db()
    try:
        data = request.json
        username = data.get('username', '').strip()
        if not username:
            return jsonify({'error': 'Username required'}), 400
        user = db.query(User).filter(User.username == username).first()
        if not user:
            return jsonify({'error': f'User "{username}" not found'}), 404
        existing = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user.id
        ).first()
        if existing:
            return jsonify({'error': 'User already in team'}), 409
        member = TeamMember(team_id=team_id, user_id=user.id, role='practitioner')
        db.add(member)
        db.commit()
        db.refresh(member)
        return jsonify(member.to_dict()), 201
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 400
    finally:
        db.close()


@app.route('/teams/<team_id>/analytics', methods=['GET'])
@require_tier('teams')
def get_team_analytics(team_id):
    db = get_db()
    try:
        patients = db.query(Patient).filter(Patient.team_id == team_id).all()
        total_scans = sum(len(p.scans) for p in patients)
        total_logs = db.query(DiagnosticLog).filter(
            DiagnosticLog.patient_id.in_([p.id for p in patients])
        ).count() if patients else 0
        return jsonify({
            'team_id': team_id,
            'total_patients': len(patients),
            'total_scans': total_scans,
            'total_diagnostic_logs': total_logs
        })
    finally:
        db.close()


# ──────────────────────────────────────
# PATIENTS — CRUD
# ──────────────────────────────────────
@app.route('/patients', methods=['GET'])
@require_auth
def get_patients():
    db = get_db()
    try:
        search = request.args.get('search', '').strip()
        team_id = request.args.get('team_id', '').strip()
        query = db.query(Patient)
        if team_id:
            query = query.filter(Patient.team_id == team_id)
        if search:
            query = query.filter(Patient.name.ilike(f'%{search}%'))
        patients = query.order_by(Patient.created_at.desc()).all()
        return jsonify([p.to_dict() for p in patients])
    finally:
        db.close()


@app.route('/patients', methods=['POST'])
@require_auth
def create_patient():
    db = get_db()
    try:
        # Check patient limit for current tier
        current_count = db.query(Patient).count()
        if not check_patient_limit(current_count):
            return jsonify({
                'error': 'upgrade_required',
                'message': 'Límite de pacientes alcanzado. Actualice su plan para agregar más.',
                'feature': 'patient_management',
                'required_tier': 'pro',
                'current_tier': get_current_tier(),
            }), 403
        data = request.json
        new_patient = Patient(
            name=data['name'],
            age=int(data['age']),
            gender=data['gender'],
            notes=data.get('notes', ''),
            phone_number=data.get('phone_number', ''),
            opt_in_whatsapp=data.get('opt_in_whatsapp', False),
            team_id=data.get('team_id')
        )
        db.add(new_patient)
        db.commit()
        db.refresh(new_patient)
        return jsonify(new_patient.to_dict()), 201
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()


@app.route('/patients/<patient_id>', methods=['GET'])
@require_auth
def get_patient(patient_id):
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        return jsonify(patient.to_dict(include_scans=True))
    finally:
        db.close()


@app.route('/patients/<patient_id>', methods=['PUT'])
def update_patient(patient_id):
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        data = request.json
        if 'name' in data:
            patient.name = data['name']
        if 'age' in data:
            patient.age = int(data['age'])
        if 'gender' in data:
            patient.gender = data['gender']
        if 'notes' in data:
            patient.notes = data['notes']
        db.commit()
        db.refresh(patient)
        return jsonify(patient.to_dict())
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()


@app.route('/patients/<patient_id>', methods=['DELETE'])
def delete_patient(patient_id):
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        db.delete(patient)
        db.commit()
        return jsonify({"message": f"Patient {patient_id} deleted"})
    finally:
        db.close()


# ──────────────────────────────────────
# SCANS — History & Management
# ──────────────────────────────────────
@app.route('/patients/<patient_id>/scans', methods=['GET'])
def get_patient_scans(patient_id):
    db = get_db()
    try:
        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).all()
        return jsonify([s.to_dict() for s in scans])
    finally:
        db.close()


@app.route('/scans/<scan_id>', methods=['GET'])
def get_scan(scan_id):
    db = get_db()
    try:
        scan = db.query(ScanResult).filter(ScanResult.id == scan_id).first()
        if not scan:
            return jsonify({"error": "Scan not found"}), 404
        return jsonify(scan.to_dict())
    finally:
        db.close()


@app.route('/scans/<scan_id>', methods=['DELETE'])
def delete_scan(scan_id):
    db = get_db()
    try:
        scan = db.query(ScanResult).filter(ScanResult.id == scan_id).first()
        if not scan:
            return jsonify({"error": "Scan not found"}), 404
        db.delete(scan)
        db.commit()
        return jsonify({"message": f"Scan {scan_id} deleted"})
    finally:
        db.close()


@app.route('/scans/<scan_id>/notes', methods=['PUT'])
def update_scan_notes(scan_id):
    db = get_db()
    try:
        scan = db.query(ScanResult).filter(ScanResult.id == scan_id).first()
        if not scan:
            return jsonify({"error": "Scan not found"}), 404
        data = request.json
        scan.practitioner_notes = data.get('notes', '')
        db.commit()
        return jsonify(scan.to_dict())
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()


# ──────────────────────────────────────
# SCAN ANALYSIS (CV Engine)
# ──────────────────────────────────────
@app.route('/scan/analyze', methods=['POST'])
def analyze_scan():
    db = get_db()
    try:
        data = request.json
        patient_id = data.get('patientId')

        if not bot:
            return jsonify({"status": "error", "message": "Bot not initialized"}), 500

        frame = bot.capture_screen()
        if frame is None:
            return jsonify({"status": "error", "message": "Failed to capture screen"}), 500

        summary = bot.summarize_scan(frame)

        # Save result to database if patient provided
        scan_record = None
        if patient_id:
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            if patient:
                organ_name = summary.get('organ_name', "Unknown Organ")
                scan = ScanResult(
                    patient_id=patient_id,
                    organ_name=organ_name,
                    entropy_points=summary.get('points', []),
                )
                scan.calculate_summary()
                db.add(scan)
                db.commit()
                db.refresh(scan)
                scan_record = scan.to_dict()

        return jsonify({
            "status": "success",
            "message": f"Analysis Complete: {summary['status']}",
            "analysis": summary,
            "scan_record": scan_record
        })

    except Exception as e:
        db.rollback()
        print(f"Analysis error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db.close()


@app.route('/scan/start', methods=['POST'])
def start_scan():
    try:
        if not bot:
            return jsonify({"status": "error", "message": "Bot not initialized"}), 500
        img = bot.capture_screen()
        if img is not None:
            points = bot.find_nidal_points(img)
            return jsonify({"status": "running", "message": f"Scan initiated. Points detected: {len(points)}"})
        return jsonify({"status": "error", "message": "Failed to capture screen"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


# ──────────────────────────────────────
# CALIBRATION
# ──────────────────────────────────────
@app.route('/control/calibrate', methods=['POST'])
def calibrate():
    try:
        data = request.json
        if bot:
            bot.save_calibration(data)
            return jsonify({"status": "success", "message": "Calibration updated", "coords": bot.coords})
        return jsonify({"status": "error", "message": "Bot not initialized"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


# ──────────────────────────────────────
# EXPORT — PDF & CSV
# ──────────────────────────────────────
@app.route('/patients/<patient_id>/export/csv', methods=['GET'])
def export_csv(patient_id):
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Scan ID', 'Organ', 'Date', 'Status', 'Total Points',
                         'Lvl 1', 'Lvl 2', 'Lvl 3', 'Lvl 4', 'Lvl 5', 'Lvl 6', 'Notes'])

        for scan in scans:
            counts = scan.counts or {}
            writer.writerow([
                scan.id,
                scan.organ_name,
                scan.timestamp.strftime('%Y-%m-%d %H:%M') if scan.timestamp else '',
                scan.status,
                scan.total_points,
                counts.get('1', 0),
                counts.get('2', 0),
                counts.get('3', 0),
                counts.get('4', 0),
                counts.get('5', 0),
                counts.get('6', 0),
                scan.practitioner_notes or ''
            ])

        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=vibrana_{patient.name.replace(" ", "_")}_scans.csv'}
        )
    finally:
        db.close()


@app.route('/patients/<patient_id>/export/pdf', methods=['GET'])
def export_pdf(patient_id):
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).all()

        # Generate PDF with ReportLab
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5 * inch)
        elements = []
        styles = getSampleStyleSheet()

        # Title
        title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, textColor=colors.HexColor('#bd93f9'))
        elements.append(Paragraph("Vibrana — Bioresonance Scan Report", title_style))
        elements.append(Spacer(1, 12))

        # Patient Info
        elements.append(Paragraph(f"<b>Patient:</b> {patient.name}", styles['Normal']))
        elements.append(Paragraph(f"<b>Age:</b> {patient.age} | <b>Gender:</b> {patient.gender}", styles['Normal']))
        elements.append(Paragraph(f"<b>Report Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
        elements.append(Spacer(1, 20))

        if scans:
            # Table header
            table_data = [['Date', 'Organ', 'Status', 'Total', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']]
            for scan in scans:
                counts = scan.counts or {}
                table_data.append([
                    scan.timestamp.strftime('%m/%d %H:%M') if scan.timestamp else 'N/A',
                    scan.organ_name[:20],
                    scan.status[:25],
                    str(scan.total_points),
                    str(counts.get('1', 0)),
                    str(counts.get('2', 0)),
                    str(counts.get('3', 0)),
                    str(counts.get('4', 0)),
                    str(counts.get('5', 0)),
                    str(counts.get('6', 0)),
                ])

            table = Table(table_data, repeatRows=1)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2a2a3c')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f5f5f5')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f0f0')]),
            ]))
            elements.append(table)
        else:
            elements.append(Paragraph("No scan results available.", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'vibrana_{patient.name.replace(" ", "_")}_report.pdf'
        )
    finally:
        db.close()


# ──────────────────────────────────────
# ROI (Region of Interest) — Phase 2
# ──────────────────────────────────────
@app.route('/cv/roi', methods=['GET'])
@require_tier('cv_tools')
def get_roi():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    return jsonify({"roi": bot.roi})


@app.route('/cv/roi', methods=['POST'])
@require_tier('cv_tools')
def set_roi():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    data = request.json
    bot.set_roi(data)
    return jsonify({"status": "success", "roi": bot.roi})


@app.route('/cv/roi', methods=['DELETE'])
@require_tier('cv_tools')
def clear_roi():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    bot.clear_roi()
    return jsonify({"status": "success", "message": "ROI cleared"})


# ──────────────────────────────────────
# HEATMAP — Phase 2
# ──────────────────────────────────────
@app.route('/cv/heatmap', methods=['GET'])
@require_tier('cv_tools')
def get_heatmap():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    frame = bot.capture_screen()
    if frame is None:
        return jsonify({"error": "Failed to capture screen"}), 500
    heatmap_b64 = bot.generate_heatmap(frame)
    return jsonify({"heatmap": heatmap_b64})


# ──────────────────────────────────────
# MONITORS — Phase 2
# ──────────────────────────────────────
@app.route('/cv/monitors', methods=['GET'])
@require_tier('cv_tools')
def get_monitors():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    return jsonify({"monitors": bot.get_monitors()})


@app.route('/cv/monitors/<int:monitor_idx>', methods=['POST'])
@require_tier('cv_tools')
def set_monitor(monitor_idx):
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    bot.set_active_monitor(monitor_idx)
    return jsonify({"status": "success", "active_monitor": monitor_idx})


# ──────────────────────────────────────
# COLOR CALIBRATION — Phase 2
# ──────────────────────────────────────
@app.route('/cv/colors', methods=['GET'])
@require_tier('cv_tools')
def get_color_ranges():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    return jsonify({"colors": bot.get_color_ranges()})


@app.route('/cv/colors', methods=['POST'])
@require_tier('cv_tools')
def set_color_ranges():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    data = request.json
    bot.save_color_ranges(data)
    return jsonify({"status": "success", "colors": bot.get_color_ranges()})


@app.route('/cv/colors/sample', methods=['POST'])
@require_tier('cv_tools')
def sample_color():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    data = request.json
    result = bot.sample_color_at_point(data.get('x', 0), data.get('y', 0))
    return jsonify(result or {"error": "Failed to sample"})


# ──────────────────────────────────────
# SNAPSHOTS — Phase 2
# ──────────────────────────────────────
@app.route('/cv/snapshots', methods=['GET'])
@require_tier('cv_tools')
def get_snapshots():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    return jsonify({"snapshots": bot.list_snapshots()})


@app.route('/cv/snapshots', methods=['POST'])
@require_tier('cv_tools')
def take_snapshot():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    data = request.json or {}
    annotations = data.get('annotations', None)
    filepath, thumb_b64 = bot.take_snapshot(annotations)
    if filepath:
        return jsonify({
            "status": "success",
            "filepath": filepath,
            "thumbnail": thumb_b64
        })
    return jsonify({"error": "Failed to take snapshot"}), 500


# ──────────────────────────────────────
# MACROS — Universal (Phase 3 upgraded)
# ──────────────────────────────────────
from macro_engine import macro_engine

@app.route('/api/macros', methods=['GET'])
def list_macros():
    return jsonify({"macros": macro_engine.list_macros()})


@app.route('/api/macros/record/start', methods=['POST'])
def start_macro_record():
    return jsonify(macro_engine.start_recording())


@app.route('/api/macros/record/stop', methods=['POST'])
def stop_macro_record():
    data = request.json or {}
    name = data.get('name', f"macro_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    return jsonify(macro_engine.stop_recording(name))


@app.route('/api/macros/<name>/play', methods=['POST'])
def play_macro(name):
    return jsonify(macro_engine.play_macro(name))


@app.route('/api/macros/<name>', methods=['DELETE'])
def delete_macro(name):
    return jsonify(macro_engine.delete_macro(name))




# ──────────────────────────────────────
# AUTO-SCAN SEQUENCE — Phase 3
# ──────────────────────────────────────
@app.route('/scan/auto-sequence', methods=['POST'])
def auto_scan_sequence():
    if not bot:
        return jsonify({"error": "Bot not initialized"}), 500
    db = get_db()
    try:
        data = request.json
        patient_id = data.get('patientId')
        organs = data.get('organs', [])

        results = bot.run_auto_scan_sequence(organs)

        # Save each successful result to DB if patient provided
        saved = []
        if patient_id:
            for result in results:
                if result['status'] == 'success':
                    analysis = result['analysis']
                    scan = ScanResult(
                        patient_id=patient_id,
                        organ_name=analysis.get('organ_name', 'Unknown'),
                        entropy_points=analysis.get('points', []),
                    )
                    scan.calculate_summary()
                    db.add(scan)
                    saved.append(scan)
            db.commit()

        return jsonify({
            "status": "completed",
            "total_organs": len(organs),
            "successful": len([r for r in results if r['status'] == 'success']),
            "results": results,
            "saved_count": len(saved)
        })
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db.close()


# ──────────────────────────────────────
# HEALTH REPORT — Phase 5
# ──────────────────────────────────────
@app.route('/patients/<patient_id>/report', methods=['GET'])
def generate_health_report(patient_id):
    """Auto-generate a comprehensive health report for a patient."""
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).all()

        if not scans:
            return jsonify({
                "patient": patient.to_dict(),
                "summary": "No scan data available for report generation.",
                "organs": [],
                "recommendations": ["Schedule initial bioresonance scan."]
            })

        # Aggregate by organ
        organ_data = {}
        total_pathology = 0
        total_compromised = 0
        total_normal = 0

        for scan in scans:
            organ = scan.organ_name or "Unknown"
            if organ not in organ_data:
                organ_data[organ] = {
                    "name": organ,
                    "scans": 0,
                    "latest_status": scan.status,
                    "latest_date": scan.timestamp.isoformat() if scan.timestamp else None,
                    "total_points": 0,
                    "avg_entropy": 0,
                    "level_counts": {str(i): 0 for i in range(1, 7)},
                    "trend": "stable"
                }

            organ_data[organ]["scans"] += 1
            organ_data[organ]["total_points"] += scan.total_points or 0
            counts = scan.counts or {}
            for lvl in range(1, 7):
                organ_data[organ]["level_counts"][str(lvl)] += int(counts.get(str(lvl), 0))

            s = (scan.status or '').lower()
            if 'pathol' in s:
                total_pathology += 1
            elif 'comprom' in s or 'disorder' in s:
                total_compromised += 1
            else:
                total_normal += 1

        # Calculate averages and trends
        organs_list = []
        for name, data in organ_data.items():
            if data["scans"] > 0:
                data["avg_entropy"] = round(data["total_points"] / data["scans"], 1)
            # Determine trend based on high-level entropy counts
            high_entropy = data["level_counts"].get("5", 0) + data["level_counts"].get("6", 0)
            low_entropy = data["level_counts"].get("1", 0) + data["level_counts"].get("2", 0)
            if high_entropy > low_entropy * 2:
                data["trend"] = "worsening"
            elif low_entropy > high_entropy * 2:
                data["trend"] = "improving"
            else:
                data["trend"] = "stable"
            organs_list.append(data)

        # Sort by concern level (pathology first)
        def concern_sort(o):
            s = (o.get("latest_status") or "").lower()
            if "pathol" in s:
                return 0
            if "comprom" in s or "disorder" in s:
                return 1
            return 2
        organs_list.sort(key=concern_sort)

        total = len(scans)
        pathology_pct = round((total_pathology / total) * 100, 1) if total else 0

        # Generate recommendations
        recommendations = []
        if total_pathology > 0:
            recommendations.append(f"⚠️ {total_pathology} scan(s) show pathological findings. Consider follow-up examination.")
        if total_compromised > 3:
            recommendations.append(f"🔶 Multiple compromised organs detected ({total_compromised}). Consider comprehensive treatment plan.")
        
        worsening = [o["name"] for o in organs_list if o["trend"] == "worsening"]
        if worsening:
            recommendations.append(f"📉 Worsening trends in: {', '.join(worsening)}. Monitor closely.")
        
        improving = [o["name"] for o in organs_list if o["trend"] == "improving"]
        if improving:
            recommendations.append(f"📈 Improving trends in: {', '.join(improving)}. Continue current treatment.")

        if not recommendations:
            recommendations.append("✅ All readings within normal parameters. Continue routine monitoring.")

        return jsonify({
            "patient": patient.to_dict(),
            "generated_at": datetime.now().isoformat(),
            "total_scans": total,
            "status_breakdown": {
                "normal": total_normal,
                "compromised": total_compromised,
                "pathology": total_pathology,
                "pathology_rate": pathology_pct
            },
            "organs": organs_list,
            "recommendations": recommendations,
            "summary": f"Patient {patient.name} has {total} scan(s) across {len(organs_list)} organ(s). "
                       f"Pathology rate: {pathology_pct}%. "
                       f"{'Immediate attention recommended.' if total_pathology > 0 else 'No critical findings.'}"
        })
    finally:
        db.close()


# ──────────────────────────────────────
# AI REPORT — Phase 16 (Gemini-powered)
# ──────────────────────────────────────
@app.route('/patients/<patient_id>/ai-report', methods=['GET'])
def get_ai_report(patient_id):
    """Generate a comprehensive AI-powered bioresonance report."""
    from report_agent import generate_narrative_report
    try:
        language = request.args.get('lang', 'es')
        result = generate_narrative_report(patient_id, language)
        if "error" in result:
            return jsonify(result), 404
        return jsonify(result)
    except Exception as e:
        print(f"[AI Report] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/patients/<patient_id>/ai-report/pdf', methods=['GET'])
def get_ai_report_pdf(patient_id):
    """Generate and download an AI-powered PDF report."""
    from report_agent import generate_pdf_report
    try:
        language = request.args.get('lang', 'es')
        pdf_bytes = generate_pdf_report(patient_id, language)
        if pdf_bytes is None:
            return jsonify({"error": "Failed to generate PDF"}), 500

        db = get_db()
        try:
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            name = patient.name.replace(" ", "_") if patient else "unknown"
        finally:
            db.close()

        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'attachment; filename=vibrana_ai_report_{name}.pdf'}
        )
    except Exception as e:
        print(f"[AI Report PDF] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────
# PUBLIC SHAREABLE WEBREPORT — Phase 18
# ──────────────────────────────────────
from auth import generate_share_token, decode_share_token

@app.route('/patients/<patient_id>/share', methods=['GET'])
@require_auth
def generate_report_share_link(patient_id):
    """Generates a secure, 30-day token for sharing a patient's report publicly."""
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        
        token = generate_share_token(patient_id)
        return jsonify({
            "success": True,
            "token": token,
            "share_url": f"/report/{token}"
        })
    finally:
        db.close()


@app.route('/public/report/<token>', methods=['GET'])
def get_public_report(token):
    """Fetches public report data (patient + scans + AI narrative) using a share token. No auth required."""
    patient_id = decode_share_token(token)
    if not patient_id:
        return jsonify({"error": "Invalid or expired sharing token"}), 401

    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).all()

        # Try to generate/fetch AI narrative, fallback if fails
        from report_agent import generate_narrative_report
        ai_report = None
        try:
            language = request.args.get('lang', 'es')
            report_data = generate_narrative_report(patient_id, language)
            if "error" not in report_data:
                ai_report = report_data
        except Exception as e:
            print(f"[Public Report] AI generation failed: {e}")

        return jsonify({
            "patient": patient.to_dict(),
            "scans": [s.to_dict() for s in scans],
            "ai_report": ai_report,
            "generated_at": datetime.now().isoformat()
        })
    finally:
        db.close()


# ──────────────────────────────────────
# AUTHENTICATION — Phase 7
# ──────────────────────────────────────
def log_audit(db, user_id, action, entity_type=None, entity_id=None, details=None):
    """Helper to create an audit log entry."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        ip_address=request.remote_addr
    )
    db.add(entry)
    db.commit()
    return entry


@app.route('/auth/register', methods=['POST'])
def register():
    db = get_db()
    try:
        data = request.json
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        full_name = data.get('full_name', '')
        role = data.get('role', 'practitioner')

        if not username or not email or not password:
            return jsonify({"error": "username, email, and password required"}), 400

        if db.query(User).filter((User.username == username) | (User.email == email)).first():
            return jsonify({"error": "Username or email already exists"}), 409

        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role=role
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        log_audit(db, user.id, 'register', 'user', user.id)

        token = generate_token(user.id, user.role)
        return jsonify({
            "token": token,
            "user": user.to_dict()
        }), 201
    finally:
        db.close()


@app.route('/auth/login', methods=['POST'])
def login():
    db = get_db()
    try:
        data = request.json
        username = data.get('username', '')
        password = data.get('password', '')

        user = db.query(User).filter(
            (User.username == username) | (User.email == username)
        ).first()

        if not user or not check_password(password, user.password_hash):
            return jsonify({"error": "Invalid credentials"}), 401

        if not user.is_active:
            return jsonify({"error": "Account is deactivated"}), 403

        user.last_login = datetime.now()
        db.commit()

        log_audit(db, user.id, 'login', 'user', user.id)

        token = generate_token(user.id, user.role)
        return jsonify({
            "token": token,
            "user": user.to_dict()
        })
    finally:
        db.close()


@app.route('/auth/me', methods=['GET'])
@require_auth
def get_current_user():
    from flask import g
    return jsonify({"user": g.current_user_dict})


@app.route('/users', methods=['GET'])
@require_auth
def list_users():
    db = get_db()
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
        return jsonify([u.to_dict() for u in users])
    finally:
        db.close()


@app.route('/users/<user_id>/toggle', methods=['POST'])
@require_auth
@require_role('admin')
def toggle_user(user_id):
    db = get_db()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        user.is_active = not user.is_active
        db.commit()
        return jsonify({"status": "success", "user": user.to_dict()})
    finally:
        db.close()


# ──────────────────────────────────────
# AUDIT LOG — Phase 7
# ──────────────────────────────────────
@app.route('/audit', methods=['GET'])
@require_auth
def get_audit_logs():
    db = get_db()
    try:
        limit = request.args.get('limit', 50, type=int)
        action_filter = request.args.get('action', None)

        query = db.query(AuditLog).order_by(AuditLog.timestamp.desc())
        if action_filter:
            query = query.filter(AuditLog.action == action_filter)

        logs = query.limit(min(limit, 200)).all()
        return jsonify([l.to_dict() for l in logs])
    finally:
        db.close()


# Create default admin on first run
def ensure_default_admin():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == 'admin').first()
        if not admin:
            admin = User(
                username='admin',
                email='admin@vibrana.local',
                password_hash=hash_password('admin123'),
                full_name='Administrator',
                role='admin'
            )
            db.add(admin)
            db.commit()
            print("[OK] Default admin created (admin / admin123)")
    finally:
        db.close()

ensure_default_admin()


# ──────────────────────────────────────
# AI & INTELLIGENCE — Phase 8
# ──────────────────────────────────────
@app.route('/ai/interpret', methods=['POST'])
@require_tier('ai_interpret')
def ai_interpret_scan():
    """AI-powered scan interpretation using entropy analysis heuristics."""
    db = get_db()
    try:
        data = request.json
        scan_id = data.get('scan_id')
        if not scan_id:
            return jsonify({"error": "scan_id required"}), 400

        scan = db.query(ScanResult).filter(ScanResult.id == scan_id).first()
        if not scan:
            return jsonify({"error": "Scan not found"}), 404

        counts = scan.counts or {}
        total = scan.total_points or 0

        # ── Risk scoring algorithm ──
        risk_score = 0
        risk_score += int(counts.get('6', 0)) * 25
        risk_score += int(counts.get('5', 0)) * 15
        risk_score += int(counts.get('4', 0)) * 8
        risk_score += int(counts.get('3', 0)) * 3
        risk_score = min(risk_score, 100)

        # ── Interpretation ──
        if risk_score >= 75:
            severity = "Critical"
            interpretation = (
                f"Significant pathological indicators detected in {scan.organ_name}. "
                f"Level 6 entropy ({counts.get('6', 0)} points) suggests active tissue degeneration. "
                "Immediate bioresonance therapy protocol recommended. "
                "Consider complementary diagnostic imaging."
            )
        elif risk_score >= 50:
            severity = "Warning"
            interpretation = (
                f"Elevated entropy levels in {scan.organ_name} indicate functional stress. "
                f"Level 5 points ({counts.get('5', 0)}) show compromised tissue resonance. "
                "Targeted frequency therapy sessions (3-5) recommended over 2 weeks."
            )
        elif risk_score >= 25:
            severity = "Attention"
            interpretation = (
                f"Mild entropy elevation in {scan.organ_name}. "
                "Pattern suggests early-stage functional imbalance. "
                "Preventive bioresonance correction advised. Re-scan in 7 days."
            )
        else:
            severity = "Normal"
            interpretation = (
                f"Entropy levels in {scan.organ_name} are within normal parameters. "
                f"Total of {total} detected points with baseline distribution. "
                "No immediate intervention required. Routine follow-up in 30 days."
            )

        # ── Recommendations ──
        recommendations = []
        if int(counts.get('6', 0)) > 0:
            recommendations.append("Schedule intensive bioresonance therapy (5 sessions)")
            recommendations.append("Cross-reference with laboratory blood panel")
            recommendations.append(f"Monitor {scan.organ_name} every 48 hours")
        if int(counts.get('5', 0)) > 2:
            recommendations.append("Apply targeted frequency correction")
            recommendations.append("Recommend dietary and supplementation support")
        if int(counts.get('4', 0)) > 3:
            recommendations.append("Lifestyle modification consultation advised")
            recommendations.append("Follow-up scan in 7 days")
        if not recommendations:
            recommendations.append("Continue routine monitoring")
            recommendations.append("Re-scan in 30 days")

        # ── Pattern detection ──
        patterns = []
        if total > 20:
            patterns.append("High point density — suggests systemic involvement")
        high_ratio = (int(counts.get('5', 0)) + int(counts.get('6', 0))) / max(total, 1)
        if high_ratio > 0.3:
            patterns.append(f"Critical point ratio: {high_ratio:.0%} — above 30% threshold")
        low_ratio = (int(counts.get('1', 0)) + int(counts.get('2', 0))) / max(total, 1)
        if low_ratio > 0.7:
            patterns.append("Predominantly baseline entropy — healthy tissue response")

        return jsonify({
            "scan_id": scan_id,
            "organ": scan.organ_name,
            "risk_score": risk_score,
            "severity": severity,
            "interpretation": interpretation,
            "recommendations": recommendations,
            "patterns": patterns,
            "entropy_distribution": counts,
            "total_points": total
        })
    finally:
        db.close()


@app.route('/ai/anomalies/<patient_id>', methods=['GET'])
@require_tier('ai_anomalies')
def ai_detect_anomalies(patient_id):
    """Detect anomalies across patient scan history."""
    db = get_db()
    try:
        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.asc()).all()

        if len(scans) < 2:
            return jsonify({"anomalies": [], "message": "Need at least 2 scans for analysis"})

        anomalies = []
        prev_scan = None
        for scan in scans:
            if prev_scan:
                prev_total = prev_scan.total_points or 0
                curr_total = scan.total_points or 0
                diff = curr_total - prev_total

                # Spike detection
                if diff > 10 or (prev_total > 0 and diff / max(prev_total, 1) > 0.5):
                    anomalies.append({
                        "type": "spike",
                        "scan_id": scan.id,
                        "organ": scan.organ_name,
                        "timestamp": scan.timestamp.isoformat() if scan.timestamp else None,
                        "message": f"Entropy spike: {prev_total} → {curr_total} (+{diff})",
                        "severity": "high" if diff > 15 else "medium"
                    })

                # Status change detection
                if prev_scan.status != scan.status and 'Pathology' in (scan.status or ''):
                    anomalies.append({
                        "type": "status_change",
                        "scan_id": scan.id,
                        "organ": scan.organ_name,
                        "timestamp": scan.timestamp.isoformat() if scan.timestamp else None,
                        "message": f"Status change: {prev_scan.status} → {scan.status}",
                        "severity": "high"
                    })

            prev_scan = scan

        return jsonify({
            "patient_id": patient_id,
            "total_scans": len(scans),
            "anomalies": anomalies,
            "risk_trend": "increasing" if anomalies else "stable"
        })
    finally:
        db.close()


# ──────────────────────────────────────
# BATCH PROCESSING & SCHEDULING — Phase 3/6
# ──────────────────────────────────────
@app.route('/batch/analyze', methods=['POST'])
@require_tier('batch_analyze')
def batch_analyze():
    """Run batch analysis across all patients or a filtered list."""
    db = get_db()
    try:
        data = request.json or {}
        patient_ids = data.get('patient_ids', [])

        if not patient_ids:
            patients = db.query(Patient).all()
            patient_ids = [p.id for p in patients]

        results = []
        for pid in patient_ids:
            scans = db.query(ScanResult).filter(
                ScanResult.patient_id == pid
            ).order_by(ScanResult.timestamp.desc()).limit(1).all()

            if not scans:
                continue

            scan = scans[0]
            counts = scan.counts or {}
            risk_score = 0
            risk_score += int(counts.get('6', 0)) * 25
            risk_score += int(counts.get('5', 0)) * 15
            risk_score += int(counts.get('4', 0)) * 8
            risk_score += int(counts.get('3', 0)) * 3
            risk_score = min(risk_score, 100)

            patient = db.query(Patient).filter(Patient.id == pid).first()
            results.append({
                "patient_id": pid,
                "patient_name": patient.name if patient else "Unknown",
                "last_scan_organ": scan.organ_name,
                "last_scan_date": scan.timestamp.isoformat() if scan.timestamp else None,
                "risk_score": risk_score,
                "status": scan.status,
                "total_points": scan.total_points or 0,
                "flagged": risk_score >= 50
            })

        results.sort(key=lambda r: r['risk_score'], reverse=True)

        return jsonify({
            "total_processed": len(results),
            "flagged_count": sum(1 for r in results if r['flagged']),
            "results": results
        })
    finally:
        db.close()


@app.route('/scans/schedule', methods=['POST'])
def schedule_scan():
    """Schedule a future scan (stores intent — requires external scheduler)."""
    db = get_db()
    try:
        data = request.json or {}
        patient_id = data.get('patient_id')
        organ = data.get('organ', '')
        scheduled_for = data.get('scheduled_for', '')

        if not patient_id or not scheduled_for:
            return jsonify({"error": "patient_id and scheduled_for required"}), 400

        # Store as an audit log entry (lightweight scheduling)
        log_audit(db, None, 'schedule_scan', 'scan', patient_id, {
            "organ": organ,
            "scheduled_for": scheduled_for,
            "status": "pending"
        })

        return jsonify({
            "status": "scheduled",
            "patient_id": patient_id,
            "organ": organ,
            "scheduled_for": scheduled_for,
            "message": "Scan scheduled. Will appear in audit log."
        }), 201
    finally:
        db.close()


@app.route('/session/start', methods=['POST'])
def start_session_recording():
    """Start recording the current session."""
    return jsonify({
        "status": "recording",
        "session_id": str(__import__('uuid').uuid4()),
        "started_at": datetime.now().isoformat(),
        "message": "Session recording started (frames saved to snapshots/)"
    })


@app.route('/session/stop', methods=['POST'])
def stop_session_recording():
    """Stop recording the current session."""
    return jsonify({
        "status": "stopped",
        "stopped_at": datetime.now().isoformat(),
        "message": "Session recording stopped"
    })


# ──────────────────────────────────────
# PHASE 9 — INTEGRATION & ECOSYSTEM
# ──────────────────────────────────────
from plugins_manager import PluginManager
import json as json_module

plugin_manager = PluginManager()

# ── Swagger / OpenAPI Docs ──
@app.route('/api/docs', methods=['GET'])
def api_docs():
    """Auto-generated OpenAPI 3.0 specification."""
    spec = {
        "openapi": "3.0.0",
        "info": {
            "title": "Vibrana NLS Overseer API",
            "version": "2.0.0",
            "description": "Bioresonance analysis platform — REST API",
            "contact": {"email": "admin@vibrana.local"}
        },
        "servers": [{"url": "http://localhost:5000"}],
        "paths": {}
    }

    # Auto-discover routes
    for rule in app.url_map.iter_rules():
        if rule.endpoint == 'static':
            continue
        path = rule.rule.replace('<', '{').replace('>', '}')
        methods = [m for m in rule.methods if m in ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')]
        if not methods:
            continue

        path_item = {}
        for method in methods:
            view_func = app.view_functions.get(rule.endpoint)
            doc = (view_func.__doc__ or '').strip() if view_func else ''
            path_item[method.lower()] = {
                "summary": rule.endpoint.replace('_', ' ').title(),
                "description": doc,
                "tags": [rule.endpoint.split('_')[0].title() if '_' in rule.endpoint else "General"],
                "responses": {
                    "200": {"description": "Success"}
                }
            }
        spec["paths"][path] = path_item

    return jsonify(spec)


# ── Email Reports ──
@app.route('/patients/<patient_id>/email-report', methods=['POST'])
def email_report(patient_id):
    """Send a health report via email (SMTP configuration required)."""
    db = get_db()
    try:
        data = request.json or {}
        recipient = data.get('email', '')
        if not recipient:
            return jsonify({"error": "Email address required"}), 400

        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).limit(10).all()

        # Build report content
        report_lines = [
            f"Vibrana Health Report — {patient.name}",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            f"Total scans: {len(scans)}",
            ""
        ]
        for scan in scans:
            report_lines.append(
                f"• {scan.organ_name}: {scan.status} ({scan.total_points} pts) — {scan.timestamp.strftime('%Y-%m-%d') if scan.timestamp else 'N/A'}"
            )

        report_text = '\n'.join(report_lines)

        # SMTP sending (stub — configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars)
        import os
        smtp_host = os.environ.get('SMTP_HOST', '')
        if smtp_host:
            try:
                import smtplib
                from email.mime.text import MIMEText
                from email.mime.multipart import MIMEMultipart

                msg = MIMEMultipart()
                msg['From'] = os.environ.get('SMTP_USER', 'noreply@vibrana.local')
                msg['To'] = recipient
                msg['Subject'] = f'Vibrana Health Report — {patient.name}'
                msg.attach(MIMEText(report_text, 'plain'))

                with smtplib.SMTP(smtp_host, int(os.environ.get('SMTP_PORT', 587))) as server:
                    server.starttls()
                    server.login(
                        os.environ.get('SMTP_USER', ''),
                        os.environ.get('SMTP_PASS', '')
                    )
                    server.send_message(msg)

                return jsonify({
                    "status": "sent",
                    "recipient": recipient,
                    "message": "Report sent successfully"
                })
            except Exception as e:
                return jsonify({"status": "error", "error": str(e)}), 500
        else:
            # No SMTP configured — return report preview
            return jsonify({
                "status": "preview",
                "recipient": recipient,
                "message": "SMTP not configured. Set SMTP_HOST env var to enable.",
                "report_preview": report_text
            })
    finally:
        db.close()


# ── DICOM Export ──
@app.route('/patients/<patient_id>/export/dicom', methods=['GET'])
def export_dicom(patient_id):
    """Export patient scan data in DICOM-compatible JSON format."""
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).all()

        # DICOM-structured JSON (simplified SR format)
        dicom_data = {
            "FileMetaInformationVersion": "01",
            "MediaStorageSOPClassUID": "1.2.840.10008.5.1.4.1.1.88.11",
            "TransferSyntaxUID": "1.2.840.10008.1.2.1",
            "PatientName": patient.name,
            "PatientID": patient.id,
            "PatientAge": str(patient.age),
            "PatientSex": patient.gender[0].upper() if patient.gender else "O",
            "StudyDate": datetime.now().strftime("%Y%m%d"),
            "InstitutionName": "Vibrana NLS Center",
            "Modality": "OT",  # Other
            "ContentSequence": []
        }

        for scan in scans:
            dicom_data["ContentSequence"].append({
                "ConceptNameCodeSequence": {
                    "CodeValue": scan.organ_name,
                    "CodingSchemeDesignator": "VIBRANA",
                    "CodeMeaning": f"NLS Entropy Analysis - {scan.organ_name}"
                },
                "DateTime": scan.timestamp.strftime("%Y%m%d%H%M%S") if scan.timestamp else "",
                "TextValue": scan.status,
                "NumericValue": scan.total_points,
                "MeasuredValueSequence": {
                    "EntropyCounts": scan.counts or {},
                    "TotalPoints": scan.total_points or 0,
                    "Status": scan.status
                }
            })

        output = io.BytesIO()
        output.write(json_module.dumps(dicom_data, indent=2).encode('utf-8'))
        output.seek(0)

        return send_file(
            output,
            mimetype='application/dicom+json',
            as_attachment=True,
            download_name=f'{patient.name.replace(" ", "_")}_dicom.json'
        )
    finally:
        db.close()


# ── Plugin Management ──
@app.route('/plugins', methods=['GET'])
def list_plugins():
    """List all discovered plugins."""
    return jsonify(plugin_manager.list_plugins())


@app.route('/plugins/<plugin_name>/load', methods=['POST'])
@require_auth
def load_plugin(plugin_name):
    """Load and activate a plugin."""
    result = plugin_manager.load(plugin_name)
    return jsonify(result)


@app.route('/plugins/<plugin_name>/unload', methods=['POST'])
@require_auth
def unload_plugin(plugin_name):
    """Unload a plugin."""
    result = plugin_manager.unload(plugin_name)
    return jsonify(result)


# ──────────────────────────────────────
# SCREEN WATCHER — AUTO CHANGE DETECTION
# ──────────────────────────────────────

@app.route('/watcher/start', methods=['POST'])
def watcher_start():
    """Start auto-watching for screen changes."""
    if not watcher:
        return jsonify({"error": "Watcher not initialized"}), 500
    data = request.json or {}
    patient_id = data.get('patient_id')
    settings = data.get('settings')
    if settings:
        watcher.update_settings(settings)
    result = watcher.start(patient_id=patient_id)
    return jsonify(result)


@app.route('/watcher/stop', methods=['POST'])
def watcher_stop():
    """Stop auto-watching."""
    if not watcher:
        return jsonify({"error": "Watcher not initialized"}), 500
    result = watcher.stop()
    return jsonify(result)


@app.route('/watcher/status')
def watcher_status():
    """Get watcher status."""
    if not watcher:
        return jsonify({"running": False, "error": "Watcher not initialized"})
    return jsonify(watcher.get_status())


@app.route('/watcher/events')
def watcher_events():
    """Get change events. Pass ?since_id=N to get only new events."""
    if not watcher:
        return jsonify({"events": [], "error": "Watcher not initialized"})
    since_id = request.args.get('since_id', 0, type=int)
    limit = request.args.get('limit', 50, type=int)
    events = watcher.get_events(since_id=since_id, limit=limit)
    return jsonify({
        "events": events,
        "total_changes": watcher.total_changes_detected,
        "watcher_running": watcher.running
    })


@app.route('/snapshots/<filename>')
def serve_snapshot(filename):
    """Serve saved NLS screen snapshots."""
    from flask import send_from_directory
    snapshot_dir = os.path.join(os.path.dirname(__file__), 'snapshots')
    if not os.path.exists(snapshot_dir):
        return jsonify({"error": "Snapshots directory not found"}), 404
    return send_from_directory(snapshot_dir, filename)


# ──────────────────────────────────────
@app.route('/watcher/settings', methods=['POST'])
def watcher_settings():
    """Update watcher sensitivity settings."""
    if not watcher:
        return jsonify({"error": "Watcher not initialized"}), 500
    data = request.json or {}
    result = watcher.update_settings(data)
    return jsonify(result)


# ──────────────────────────────────────
# DIAGNOSTIC LOGS — Auto-logged change detection
# ──────────────────────────────────────
from models import DiagnosticLog

@app.route('/diagnostic-logs', methods=['GET'])
def get_diagnostic_logs():
    """Get paginated diagnostic logs with filters."""
    db = get_db()
    try:
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 200)
        patient_id = request.args.get('patient_id')
        organ = request.args.get('organ')
        severity = request.args.get('severity')
        event_type = request.args.get('event_type')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        search = request.args.get('search', '').strip()

        query = db.query(DiagnosticLog).order_by(DiagnosticLog.timestamp.desc())

        if patient_id:
            query = query.filter(DiagnosticLog.patient_id == patient_id)
        if organ:
            query = query.filter(DiagnosticLog.organ_detected.ilike(f'%{organ}%'))
        if severity:
            query = query.filter(DiagnosticLog.severity == severity)
        if event_type:
            query = query.filter(DiagnosticLog.event_type == event_type)
        if date_from:
            query = query.filter(DiagnosticLog.timestamp >= datetime.fromisoformat(date_from))
        if date_to:
            query = query.filter(DiagnosticLog.timestamp <= datetime.fromisoformat(date_to))
        if search:
            query = query.filter(
                DiagnosticLog.organ_detected.ilike(f'%{search}%') |
                DiagnosticLog.ocr_text.ilike(f'%{search}%') |
                DiagnosticLog.header_text.ilike(f'%{search}%')
            )

        total = query.count()
        logs = query.offset((page - 1) * per_page).limit(per_page).all()

        return jsonify({
            "logs": [log.to_dict() for log in logs],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        })
    finally:
        db.close()


@app.route('/diagnostic-logs/stats', methods=['GET'])
def get_diagnostic_log_stats():
    """Get summary statistics for diagnostic logs."""
    db = get_db()
    try:
        from sqlalchemy import func
        total = db.query(DiagnosticLog).count()

        by_severity = {}
        sev_results = db.query(DiagnosticLog.severity, func.count(DiagnosticLog.id)).group_by(DiagnosticLog.severity).all()
        for sev, count in sev_results:
            by_severity[sev or 'normal'] = count

        by_organ = {}
        organ_results = db.query(DiagnosticLog.organ_detected, func.count(DiagnosticLog.id)).group_by(DiagnosticLog.organ_detected).order_by(func.count(DiagnosticLog.id).desc()).limit(20).all()
        for organ, count in organ_results:
            by_organ[organ or 'Unknown'] = count

        # Recent activity (last 24h)
        from datetime import timedelta
        recent_cutoff = datetime.utcnow() - timedelta(hours=24)
        recent_count = db.query(DiagnosticLog).filter(DiagnosticLog.timestamp >= recent_cutoff).count()

        # Latest log
        latest = db.query(DiagnosticLog).order_by(DiagnosticLog.timestamp.desc()).first()

        return jsonify({
            "total_logs": total,
            "recent_24h": recent_count,
            "by_severity": by_severity,
            "by_organ": by_organ,
            "latest_timestamp": latest.timestamp.isoformat() if latest else None,
            "watcher_persisted": watcher.total_logs_persisted if watcher else 0
        })
    finally:
        db.close()


@app.route('/diagnostic-logs/<log_id>', methods=['GET'])
def get_diagnostic_log(log_id):
    """Get a single diagnostic log by ID."""
    db = get_db()
    try:
        log = db.query(DiagnosticLog).filter(DiagnosticLog.id == log_id).first()
        if not log:
            return jsonify({"error": "Log not found"}), 404
        return jsonify(log.to_dict())
    finally:
        db.close()


@app.route('/diagnostic-logs/<log_id>', methods=['DELETE'])
def delete_diagnostic_log(log_id):
    """Delete a single diagnostic log."""
    db = get_db()
    try:
        log = db.query(DiagnosticLog).filter(DiagnosticLog.id == log_id).first()
        if not log:
            return jsonify({"error": "Log not found"}), 404
        db.delete(log)
        db.commit()
        return jsonify({"status": "deleted", "id": log_id})
    finally:
        db.close()


@app.route('/diagnostic-logs/clear', methods=['POST'])
def clear_diagnostic_logs():
    """Clear diagnostic logs, optionally filtered by date."""
    db = get_db()
    try:
        data = request.json or {}
        query = db.query(DiagnosticLog)
        if data.get('before'):
            query = query.filter(DiagnosticLog.timestamp < datetime.fromisoformat(data['before']))
        deleted = query.delete()
        db.commit()
        return jsonify({"status": "cleared", "deleted_count": deleted})
    finally:
        db.close()


@app.route('/diagnostic-logs/export', methods=['GET'])
def export_diagnostic_logs_csv():
    """Export diagnostic logs as CSV."""
    db = get_db()
    try:
        import csv
        import io
        logs = db.query(DiagnosticLog).order_by(DiagnosticLog.timestamp.desc()).limit(5000).all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Timestamp', 'Organ', 'Severity', 'Change%', 'Status',
                         'Total Points', 'NLS Window', 'OCR Text', 'Patient ID'])
        for log in logs:
            analysis = log.entropy_analysis or {}
            writer.writerow([
                log.timestamp.isoformat() if log.timestamp else '',
                log.organ_detected,
                log.severity,
                log.change_pct,
                analysis.get('status', ''),
                analysis.get('total_points', 0),
                'Yes' if log.nls_window_found else 'No',
                (log.ocr_text or '')[:200],
                log.patient_id or ''
            ])

        csv_content = output.getvalue()
        return Response(
            csv_content,
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=diagnostic_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'}
        )
    finally:
        db.close()

# ──────────────────────────────────────
# VIDEO FEED
# ──────────────────────────────────────
@app.route('/video_feed')
def video_feed():
    def generate():
        while True:
            frame = bot.capture_screen()
            if frame is None:
                time.sleep(0.1)
                continue
            # Resize to HD while maintaining aspect ratio
            h, w = frame.shape[:2]
            target_w = 1280
            scale = target_w / w
            target_h = int(h * scale)
            frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
            # Encode with high quality JPEG
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.033)  # ~30fps cap

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


# ──────────────────────────────────────
# NLS PDF ANALYZER
# ──────────────────────────────────────
@app.route('/api/analyze-nls-scan', methods=['POST'])
def analyze_nls_pdf_endpoint():
    try:
        if 'file' not in request.files:
            return jsonify({"status": "error", "message": "No file uploaded"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"status": "error", "message": "No file selected"}), 400
            
        therapies_str = request.form.get('therapies', '')
        selected_therapies = therapies_str.split('|') if therapies_str else [
            "Nutrición Funcional y Suplementos",
            "Fitoterapia", 
            "Homeopatía y Terapia Frecuencial",
            "Terapia Física y Ejercicio"
        ]
        
        therapies_bullet_list = "\n".join([f"- {t}" for t in selected_therapies])
            
        import pypdf
        reader = pypdf.PdfReader(file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        
        # ── KNOWLEDGE BASE INJECTION (Phase 16) ──
        reference_ids_str = request.form.get('reference_ids', '')
        reference_text = ""
        if reference_ids_str:
            ref_ids = [r for r in reference_ids_str.split(',') if r.strip()]
            if ref_ids:
                db = get_db()
                from models import ReferenceDocument
                docs = db.query(ReferenceDocument).filter(ReferenceDocument.id.in_(ref_ids)).all()
                for d in docs:
                    reference_text += f"\n\n--- DOCUMENTO DE REFERENCIA: {d.filename} ---\n{d.extracted_text}\n"
                db.close()
        
        from report_agent import call_gemini_sync
        
        kb_injection = f"**BASE DE CONOCIMIENTO EXTERNA (OBLIGATORIO):**\nEl profesional ha proporcionado la siguiente literatura de referencia. DEBES basar tu diagnóstico, dosis, remedios y sugerencias en ESTOS documentos primarios:\n{reference_text}" if reference_text else ""
        
        prompt = f"""Eres un experto intérprete de biorresonancia y diagnóstico por Sistema No Lineal (NLS), entrenado estrictamente en Lógica Cuántico-Entrópica y similitud espectral. Tu propósito es analizar datos de escaneo NLS y generar un plan terapéutico COMPLETO, DETALLADO y ACCIONABLE con un régimen semanal.

IDIOMA: Toda tu respuesta debe estar COMPLETAMENTE en ESPAÑOL.

**RESTRICCIÓN DE CASCADA TERAPÉUTICA:**
El usuario ha solicitado ESTRICTAMENTE que las terapias recomendadas se limiten a las siguientes disciplinas o enfoques:
{therapies_bullet_list}

SIEMPRE respeta estas disciplinas. No recomiendes suplementos si "Nutrición Funcional" no está listada, no recomiendes hierbas chinas si "MTC" no está listada, etc. Solo genera las categorías requeridas.

{kb_injection}


Reglas de Interpretación:

Escala de Fleindler: Evalúa la escala de íconos 1-6. Íconos 1-3 indican energía normal o latente. Ícono 4 indica un estado agudo. Íconos 5-6 indican entropía severa, bloqueos o patología crónica.

Disociación Gráfica Rojo/Azul: Analiza las líneas de frecuencia anabólica (Rojo) y catabólica (Azul). Líneas entrelazadas = homeostasis. Separación alta = mayor entropía y degradación funcional.

CSS (Valor-D): CSS < 0.425 = patología activa. CSS 0.425-0.750 = problema subagudo. CSS > 1.0 = sin resonancia significativa.

INSTRUCCIONES PARA EL PLAN TERAPÉUTICO:

1. TERAPIAS RECOMENDADAS: Cada categoría debe incluir MÚLTIPLES ítems con: nombre exacto, para qué sirve, protocolo con dosis/frecuencia, e impacto esperado.

2. RÉGIMEN SEMANAL: Debes crear un calendario de 7 días con actividades distribuidas en 3 bloques del día (mañana, mediodía, noche). Cada día debe incluir qué suplementos tomar, qué alimentos consumir, qué ejercicios realizar, y qué terapias aplicar.

3. NUTRICIÓN ESPECÍFICA: Para cada recomendación nutricional, incluye:
   - Nombres ESPECÍFICOS de suplementos con marca sugerida y compuesto activo
   - ALIMENTOS CONCRETOS que contienen los nutrientes necesarios (ej: "espinacas, brócoli, kale" para hierro)
   - HIERBAS Y EXTRACTOS específicos (ej: "raíz de cúrcuma fresca rallada", "tintura de equinácea 30 gotas")
   - Compuestos activos exactos (ej: "curcuminoides 95%", "silimarina 80%")

4. EJERCICIO ESPECÍFICO (Si aplica): Para cada ejercicio incluye:
   - Nombre del movimiento exacto
   - Series, repeticiones o duración
   - Posición de inicio y ejecución
   - Qué días de la semana realizarlo


ESQUEMA JSON:
{{
  "scan_metadata": {{
    "organ_or_tissue": "Estructura escaneada en español",
    "base_frequency_hz": 4.9
  }},
  "entropic_analysis": {{
    "fleindler_entropy_level": 6,
    "red_blue_dissociation": "Disociación Severa",
    "css_d_value": 0.312
  }},
  "clinical_synthesis": "Resumen de 3-4 oraciones: estado energético, compromiso funcional, causas entrópicas, urgencia.",
  "recommended_etalons": [
    {{
      "category": "Homeopatía",
      "remedy_name": "Nombre general de la terapia",
      "target_action": "Objetivo terapéutico principal",
      "items": [
        {{
          "name": "Arsenicum Album 30CH",
          "purpose": "Para qué sirve en relación al órgano afectado",
          "protocol": "Dosis exacta, frecuencia, duración",
          "expected_impact": "Beneficio concreto que experimentará el paciente"
        }}
      ]
    }},
    {{
      "category": "Nutrición Funcional",
      "remedy_name": "Plan Nutricional Integral",
      "target_action": "Objetivo nutricional",
      "items": [
        {{
          "name": "Vitamina D3 (Colecalciferol) + K2 (MK-7)",
          "purpose": "Esencial para absorción de calcio y formación ósea",
          "protocol": "5000 UI D3 + 100mcg K2 con comida con grasas, 90 días",
          "expected_impact": "Mejora densidad ósea y sistema inmune",
          "food_sources": ["Salmón salvaje", "Sardinas", "Yemas de huevo", "Hongos shiitake expuestos al sol"],
          "compound": "Colecalciferol + Menaquinona-7"
        }}
      ]
    }},
    {{
      "category": "Terapia Física",
      "remedy_name": "Programa de Ejercicios",
      "target_action": "Objetivo del programa",
      "items": [
        {{
          "name": "Sentadillas asistidas",
          "purpose": "Fortalecimiento de cuádriceps y estimulación ósea",
          "protocol": "3 series de 12 repeticiones, descanso 60 segundos entre series",
          "expected_impact": "Aumenta densidad ósea en fémur y mejora equilibrio",
          "days": ["Lunes", "Miércoles", "Viernes"]
        }}
      ]
    }}
  ],
  "foods_to_eat": [
    {{
      "food": "Espinacas",
      "benefit": "Rica en hierro, calcio y magnesio. Apoya la formación de glóbulos rojos.",
      "how_to_consume": "2 tazas al día en ensalada o batido verde",
      "active_compounds": ["Hierro no hemo", "Ácido fólico", "Vitamina K"]
    }},
    {{
      "food": "Cúrcuma fresca",
      "benefit": "Antiinflamatorio potente que reduce la entropía tisular",
      "how_to_consume": "1 cucharadita de raíz fresca rallada en leche dorada o sopas",
      "active_compounds": ["Curcuminoides (95%)", "Turmerona"]
    }}
  ],
  "foods_to_avoid": [
    {{
      "food": "Azúcar refinada",
      "reason": "Aumenta la inflamación y alimenta patógenos intestinales"
    }}
  ],
  "herbal_teas": [
    {{
      "herb": "Manzanilla (Matricaria chamomilla)",
      "benefit": "Antiinflamatorio digestivo, reduce la ansiedad",
      "preparation": "1 cucharada de flores secas en 250ml de agua caliente, reposar 10 min",
      "when": "Después de cada comida principal"
    }}
  ],
  "weekly_regime": [
    {{
      "day": "Lunes",
      "morning": {{
        "supplements": ["5 gránulos Arsenicum Album 30CH sublingual", "5000 UI Vitamina D3+K2 con desayuno"],
        "food": "Avena con semillas de chía, arándanos y miel de abeja cruda. Té de jengibre.",
        "exercise": "Caminata enérgica 30 min + 5 min estiramientos de columna"
      }},
      "midday": {{
        "supplements": ["500mg Cúrcuma con piperina con almuerzo", "Probiótico 50B UFC"],
        "food": "Ensalada de espinacas, salmón al horno, quinoa. Limonada con jengibre.",
        "therapy": "Meta-terapia NLS 15 min (si disponible)"
      }},
      "evening": {{
        "supplements": ["400mg Magnesio Bisglicinato", "L-Glutamina 5g en agua"],
        "food": "Crema de calabaza con cúrcuma, pechuga a la plancha. Té de manzanilla.",
        "exercise": "Estiramientos suaves 15 min + meditación guiada 10 min"
      }}
    }},
    {{
      "day": "Martes",
      "morning": {{ "..." : "..." }},
      "midday": {{ "..." : "..." }},
      "evening": {{ "..." : "..." }}
    }}
  ],
  "next_scan": {{
    "timeframe": "1 semana | 1 mes | 6 meses | 12 meses",
    "reason": "Explicación clínica detallada de por qué se recomienda este intervalo específico basado en la severidad de los hallazgos",
    "what_to_monitor": ["Primer aspecto a monitorear en el próximo escaneo", "Segundo aspecto"]
  }}
}}

REGLAS IMPORTANTES:
- Genera categorías terapéuticas ÚNICAMENTE de las disciplinas permitidas.
- Si Nutrición Funcional está permitida: MÍNIMO 4-5 ítems con suplementos Y fuentes alimentarias.
- Si Terapia Física está permitida: MÍNIMO 3-4 ejercicios.
- foods_to_eat / foods_to_avoid / herbal_teas deben seguir los lineamientos de las dietas permitidas (ej. si MTC está activa, sugiere alimentos cálidos/fríos según MTC).
- weekly_regime: EXACTAMENTE 7 días (Lunes a Domingo), cada día con morning/midday/evening. Distribuye las terapias permitidas en los bloques horarios.
- Cada bloque del día debe tener supplements, food, y exercise o therapy según corresponda
- NOMBRA alimentos reales, hierbas reales, extractos con nombres científicos
- Sé ULTRA-ESPECÍFICO: "500mg de extracto de Cardo Mariano (Silybum marianum, 80% silimarina)"
- next_scan: Recomienda UN timeframe ("1 semana" para casos críticos CSS<0.1, "1 mes" para severos, "6 meses" para moderados, "12 meses" para leves). Explica POR QUÉ ese intervalo y QUÉ se va a monitorear

TEXTO DEL ESCANEO:
{text[:8000]}
"""
        report_data = call_gemini_sync(prompt)
        
        if isinstance(report_data, dict) and report_data.get("status") == "error":
            return jsonify(report_data), 500

        # We enclose the AI JSON inside our API envelope
        return jsonify({
            "status": "success",
            "report_data": report_data
        })
    except Exception as e:
        print(f"[PDF Analyzer] Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ──────────────────────────────────────
# KNOWLEDGE BASE — Phase 16
# ──────────────────────────────────────
@app.route('/api/references', methods=['GET'])
@require_auth
def list_reference_documents(current_user):
    """List all uploaded reference documents."""
    db = get_db()
    from models import ReferenceDocument
    try:
        docs = db.query(ReferenceDocument).order_by(ReferenceDocument.created_at.desc()).all()
        return jsonify({"status": "success", "references": [d.to_dict() for d in docs]})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/references/upload', methods=['POST'])
@require_auth
def upload_reference_document(current_user):
    """Upload and extract text from a new reference PDF."""
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No file selected"}), 400
        
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"status": "error", "message": "Only PDF files are supported"}), 400

    try:
        # Extract text
        import pypdf
        reader = pypdf.PdfReader(file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
            
        if not text.strip():
            return jsonify({"status": "error", "message": "Could not extract any text from this PDF."}), 400

        # Save to database
        db = get_db()
        from models import ReferenceDocument
        
        # Check if already exists (by filename to prevent duplicates)
        existing = db.query(ReferenceDocument).filter(ReferenceDocument.filename == file.filename).first()
        if existing:
            return jsonify({"status": "error", "message": "A document with this name already exists."}), 400
            
        new_doc = ReferenceDocument(
            filename=file.filename,
            extracted_text=text,
            uploaded_by=current_user.id
        )
        db.add(new_doc)
        db.commit()
        
        return jsonify({
            "status": "success", 
            "message": "Document uploaded securely to knowledge base.",
            "document": new_doc.to_dict()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

# ──────────────────────────────────────
# DB MIGRATION ENDPOINT (PHASE 15 & 16)
# ──────────────────────────────────────
@app.route('/api/migrate-db', methods=['POST'])
def migrate_db():
    db = get_db()
    from sqlalchemy.sql import text
    try:
        # Phase 15
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(20)"))
                conn.commit()
            except Exception: pass
            
            try:
                conn.execute(text("ALTER TABLE patients ADD COLUMN opt_in_whatsapp BOOLEAN DEFAULT FALSE"))
                conn.commit()
            except Exception: pass
            
        # Phase 16 - Create new table if not exists using declarative base
        from models import Base
        Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables.get('reference_documents')])
            
        return jsonify({"status": "success", "message": "Migrations run successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Migration error: {str(e)}"})






# ──────────────────────────────────────
# NLS REPORT PDF DOWNLOAD
# ──────────────────────────────────────
@app.route('/api/nls-report-pdf', methods=['POST'])
def nls_report_pdf():
    """Generate a downloadable PDF from the NLS scan report data."""
    try:
        data = request.json
        if not data or 'report_data' not in data:
            return jsonify({"error": "Missing report_data in request body"}), 400

        from nls_pdf_generator import generate_nls_pdf
        pdf_bytes = generate_nls_pdf(data['report_data'])

        buffer = io.BytesIO(pdf_bytes)
        buffer.seek(0)

        organ = data['report_data'].get('scan_metadata', {}).get('organ_or_tissue', 'NLS')
        safe_name = organ.replace(' ', '_').replace(',', '')[:40]
        filename = f'Vibrana_Reporte_{safe_name}_{datetime.now().strftime("%Y%m%d")}.pdf'

        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f"[NLS PDF] Error generating PDF: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error generating PDF: {str(e)}"}), 500


# ──────────────────────────────────────
# MAIN
# ──────────────────────────────────────
if __name__ == '__main__':
    print("Starting Vibrana Backend on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=True)

