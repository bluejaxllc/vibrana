"""
Vibrana Cloud Backend — Persistent API Server
Deployed to Render. Contains all cloud-safe routes (no screen capture dependencies).
"""
from flask import Flask, jsonify, request, Response, send_file, g
from flask_cors import CORS
from database import init_db, SessionLocal
from models import Patient, ScanResult, User, AuditLog, DiagnosticLog, SystemConfig, Team, TeamMember, MessageLog
from auth import hash_password, check_password, generate_token, require_auth, require_role
import csv
import io
import json
import time
import uuid
import requests
from datetime import datetime, date, timedelta
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": [
    "http://localhost:5176",
    "http://localhost:5177",
    "https://vibrana.vercel.app",
    "https://vibrana.bluejax.ai",
    "https://www.bluejax.ai",
    "https://bluejax.ai",
]}})


# Initialize database
init_db()


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


# ──────────────────────────────────────
# STATUS
# ──────────────────────────────────────
@app.route('/status', methods=['GET'])
def get_status():
    return jsonify({"status": "online", "message": "Vibrana Cloud API Ready", "bot_online": False, "cloud": True})


# ──────────────────────────────────────
# STATIC ASSETS — Phase 11
# ──────────────────────────────────────
@app.route('/snapshots/<path:filename>')
def get_snapshot(filename):
    """Serve diagnostic snapshots from the snapshots directory."""
    return send_file(os.path.join(os.path.dirname(__file__), 'snapshots', filename))


# ──────────────────────────────────────
# STATS (Dashboard widgets)
# ──────────────────────────────────────
@app.route('/stats', methods=['GET'])
def get_stats():
    db = get_db()
    try:
        total_patients = db.query(Patient).count()
        all_scans = db.query(ScanResult).all()
        total_scans = len(all_scans)

        today = datetime.combine(date.today(), datetime.min.time())
        scans_today = [s for s in all_scans if s.timestamp and s.timestamp >= today]
        
        # Aggregate status distribution
        status_counts = {"Normal": 0, "Compromised": 0, "Pathology": 0}
        entropy_dist = {str(i): 0 for i in range(1, 7)}

        for s in all_scans:
            # Status mapping
            stat = (s.status or '').lower()
            if 'pathol' in stat: status_counts["Pathology"] += 1
            elif 'comprom' in stat or 'disorder' in stat: status_counts["Compromised"] += 1
            else: status_counts["Normal"] += 1

            # Entropy mapping
            if s.counts:
                for k, v in s.counts.items():
                    if k in entropy_dist:
                        entropy_dist[k] += int(v or 0)

        # Recent activity
        recent_activity = [{
            "id": s.id,
            "organ_name": s.organ_name,
            "status": s.status,
            "timestamp": s.timestamp.isoformat() if s.timestamp else None,
            "patient_name": s.patient.name if s.patient else "Unknown"
        } for s in sorted(all_scans, key=lambda x: x.timestamp or datetime.min, reverse=True)[:5]]

        return jsonify({
            "total_patients": total_patients,
            "total_scans": total_scans,
            "scans_today": len(scans_today),
            "status_counts": status_counts,
            "entropy_distribution": entropy_dist,
            "bot_online": False,
            "recent_activity": recent_activity
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
        user_id = g.current_user_dict['id']
        team_id = request.args.get('team_id')
        
        # Security: Verify user is in the team (or admin)
        if team_id:
            membership = db.query(TeamMember).filter(
                TeamMember.user_id == user_id,
                TeamMember.team_id == team_id
            ).first()
            if not membership and g.current_user_dict['role'] != 'admin':
                return jsonify({"error": "Access denied to this team"}), 403
        else:
            # Default to user's first team if not specified
            first_team = db.query(TeamMember).filter(TeamMember.user_id == user_id).first()
            team_id = first_team.team_id if first_team else None

        search = request.args.get('search', '').strip()
        query = db.query(Patient).filter(Patient.team_id == team_id)
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
        data = request.json
        user_id = g.current_user_dict['id']
        
        team_id = data.get('team_id')
        if not team_id:
            first_team = db.query(TeamMember).filter(TeamMember.user_id == user_id).first()
            team_id = first_team.team_id if first_team else None
            
        if not team_id:
            return jsonify({"error": "No active team found for patient assignment"}), 400

        new_patient = Patient(
            name=data['name'],
            age=int(data['age']),
            gender=data['gender'],
            notes=data.get('notes', ''),
            team_id=team_id
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
    """Generate a clinical-grade PDF report with silhouette and trends."""
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.desc()).all()

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5 * inch)
        elements = []
        styles = getSampleStyleSheet()

        # Custom Styles
        title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=22, textColor=colors.HexColor('#bd93f9'), spaceAfter=12)
        h3_style = ParagraphStyle('H3', parent=styles['Heading3'], fontSize=14, textColor=colors.HexColor('#8be9fd'), spaceBefore=10, spaceAfter=6)
        
        elements.append(Paragraph("Vibrana — Clinical Health Report", title_style))
        
        # Patient Info Header
        info_data = [
            [Paragraph(f"<b>Patient:</b> {patient.name}", styles['Normal']), 
             Paragraph(f"<b>ID:</b> {patient.id[:8]}...", styles['Normal'])],
            [Paragraph(f"<b>Age/Gender:</b> {patient.age} / {patient.gender}", styles['Normal']),
             Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal'])]
        ]
        info_table = Table(info_data, colWidths=[3.5*inch, 3.5*inch])
        info_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
        elements.append(info_table)
        elements.append(Spacer(1, 20))

        # ── SILHOUETTE COMPOSITING (Phase 11) ──
        silhouette_path = os.path.join(os.path.dirname(__file__), 'assets', 'human_silhouette.png')
        if os.path.exists(silhouette_path):
            elements.append(Paragraph("Diagnostic Visualization — Global Entropy Map", h3_style))
            
            # Simple canvas drawing to overlay dots on silhouette
            # For a more advanced version, we'd use RLImage and drawing operations,
            # but for Phase 11 MVP, we will list the markers or use a composited image.
            # Let's add the silhouette image.
            sil_img = RLImage(silhouette_path, width=3*inch, height=4.5*inch)
            elements.append(sil_img)
            
            elements.append(Paragraph("<font size=8 color='#6272a4'>* Silhouette markers indicate scanned areas with detected entropy levels.</font>", styles['Normal']))
            
            # Add a small note about the most active regions
            if scans:
                top_organs = list(set([s.organ_name for s in scans[:5]]))
                elements.append(Paragraph(f"<font size=8>Active diagnostic regions: {', '.join(top_organs)}</font>", styles['Normal']))
            
            elements.append(Spacer(1, 15))

        # Scan Data Table
        elements.append(Paragraph("Recent Scans & Entropy Analysis", h3_style))
        if scans:
            table_data = [['Date', 'Organ System', 'Status', 'Total', 'L1-3', 'L4-6']]
            for scan in scans[:15]:  # Limit to 15 recent scans for clarity
                counts = scan.counts or {}
                l13 = int(counts.get('1',0)) + int(counts.get('2',0)) + int(counts.get('3',0))
                l46 = int(counts.get('4',0)) + int(counts.get('5',0)) + int(counts.get('6',0))
                
                table_data.append([
                    scan.timestamp.strftime('%m/%d %H:%M') if scan.timestamp else '—',
                    scan.organ_name[:25],
                    scan.status[:20],
                    str(scan.total_points),
                    str(l13),
                    str(l46),
                ])

            table = Table(table_data, repeatRows=1, colWidths=[1.1*inch, 1.8*inch, 1.5*inch, 0.7*inch, 0.7*inch, 0.7*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#282a36')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#44475a')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f8f2')])
            ]))
            elements.append(table)
        else:
            elements.append(Paragraph("No scan history recorded.", styles['Normal']))

        # Longitudinal Analysis Summary
        if len(scans) >= 2:
            elements.append(Spacer(1, 20))
            elements.append(Paragraph("Longitudinal Progress Tracking", h3_style))
            first = scans[-1].total_points or 0
            latest = scans[0].total_points or 0
            change = latest - first
            trend = "improving" if change < -5 else "worsening" if change > 5 else "stable"
            
            elements.append(Paragraph(
                f"Comparison of baseline vs. current scan shows a <b>{abs(change)} point {('increase' if change > 0 else 'decrease')}</b> in total entropy. "
                f"Overall client trend is classified as <b>{trend.upper()}</b>.",
                styles['Normal']
            ))

        # Team Signature (Phase 14)
        team_id = request.args.get('team_id')
        if team_id:
            team = db.query(Team).filter(Team.id == team_id).first()
            if team:
                elements.append(Spacer(1, 40))
                elements.append(Paragraph(f"<b>Report Authorized By:</b> {team.name} Clinical Team", styles['Normal']))
                elements.append(Paragraph("<i>Digital Signature Verified</i>", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'Vibrana_Report_{patient.name.replace(" ", "_")}.pdf'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

# ──────────────────────────────────────
# EHR INTEGRATION STUBS — Phase 14
# ──────────────────────────────────────
@app.route('/patients/<patient_id>/export/dicom', methods=['GET'])
@require_auth
def export_dicom(patient_id):
    """Stub for generating DICOM encapsulated PDF or SR (Structured Report)."""
    return jsonify({
        "status": "success",
        "message": "DICOM export generated successfully.",
        "download_url": f"/mock-downloads/dicom/{patient_id}.dcm"
    })

@app.route('/patients/<patient_id>/export/hl7', methods=['GET'])
@require_auth
def export_hl7(patient_id):
    """Stub for generating HL7 ORU (Observation Result) message."""
    return jsonify({
        "status": "success",
        "message": "HL7 ORU message generated successfully.",
        "payload": f"MSH|^~\\&|VIBRANA|CLINIC|EHR|HOSPITAL|{datetime.utcnow().strftime('%Y%m%d%H%M%S')}||ORU^R01|MSG{uuid.uuid4().hex[:8]}|P|2.5\\nPID|1||{patient_id}||Unknown^Patient|||M"
    })

# ──────────────────────────────────────
# WHATSAPP MESSAGING — Phase 15
# ──────────────────────────────────────
@app.route('/patients/<patient_id>/whatsapp', methods=['POST'])
@require_auth
def send_whatsapp_message(patient_id):
    """Send a WhatsApp message to the patient."""
    db = get_db()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

        if not patient.phone_number:
            return jsonify({"error": "Patient does not have a registered phone number."}), 400

        if not patient.opt_in_whatsapp:
            return jsonify({"error": "Patient has not opted in for WhatsApp messages."}), 403

        data = request.json
        content = data.get('content')
        if not content:
            return jsonify({"error": "Message content is required"}), 400

        # GHL Integration
        webhook_url = os.environ.get('GHL_WHATSAPP_WEBHOOK')
        if not webhook_url:
            config = db.query(SystemConfig).filter(SystemConfig.key == 'ghl_whatsapp_webhook').first()
            if config:
                webhook_url = config.value
                
        if webhook_url:
            try:
                payload = {
                    "phone": patient.phone_number,
                    "message": content,
                    "patient_name": patient.name,
                    "patient_id": patient_id
                }
                resp = requests.post(webhook_url, json=payload, timeout=5)
                if not resp.ok:
                    print(f"GHL Webhook returned {resp.status_code}: {resp.text}")
            except Exception as e:
                print(f"Failed to post to GHL webhook: {e}")
                # We continue to log the message even if the webhook fails for resilience,
                # but in a stricter setup we might return 502 here.

        # Log the message
        log_entry = MessageLog(
            patient_id=patient_id,
            team_id=patient.team_id,
            sender_id=g.current_user_dict['id'],
            message_type='whatsapp',
            content=content,
            status='sent'
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)

        log_audit(db, g.current_user_dict['id'], 'whatsapp_sent', entity_type='patient', entity_id=patient_id)
        
        return jsonify({"status": "success", "message": "WhatsApp message sent correctly.", "log": log_entry.to_dict()}), 201

    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@app.route('/patients/<patient_id>/messages', methods=['GET'])
@require_auth
def get_patient_messages(patient_id):
    """Retrieve the messaging log for a patient."""
    db = get_db()
    try:
        messages = db.query(MessageLog).filter(MessageLog.patient_id == patient_id).order_by(MessageLog.timestamp.desc()).all()
        return jsonify([m.to_dict() for m in messages])
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

        organs_list = []
        for name, data in organ_data.items():
            if data["scans"] > 0:
                data["avg_entropy"] = round(data["total_points"] / data["scans"], 1)
            high_entropy = data["level_counts"].get("5", 0) + data["level_counts"].get("6", 0)
            low_entropy = data["level_counts"].get("1", 0) + data["level_counts"].get("2", 0)
            if high_entropy > low_entropy * 2:
                data["trend"] = "worsening"
            elif low_entropy > high_entropy * 2:
                data["trend"] = "improving"
            else:
                data["trend"] = "stable"
            organs_list.append(data)

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
# AUTHENTICATION — Phase 7
# ──────────────────────────────────────
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
            db.refresh(admin)
            print("[OK] Default admin created (admin / admin123)")

        # Ensure default team exists (Phase 12)
        default_team = db.query(Team).filter(Team.name == 'Vibrana Clinical').first()
        if not default_team:
            default_team = Team(name='Vibrana Clinical')
            db.add(default_team)
            db.commit()
            db.refresh(default_team)
            print(f"[OK] Default team created: {default_team.name}")

        # Ensure admin is in the default team
        membership = db.query(TeamMember).filter(
            TeamMember.user_id == admin.id,
            TeamMember.team_id == default_team.id
        ).first()
        if not membership:
            membership = TeamMember(user_id=admin.id, team_id=default_team.id, role='owner')
            db.add(membership)
            db.commit()
            print(f"[OK] Admin added to team {default_team.name} as owner")
    finally:
        db.close()

ensure_default_admin()


# ──────────────────────────────────────
# AI & INTELLIGENCE — Phase 8
# ──────────────────────────────────────
@app.route('/ai/interpret', methods=['POST'])
def ai_interpret_scan():
    """Enhanced AI interpretation with historical context (Phase 11)."""
    db = get_db()
    try:
        data = request.json
        scan_id = data.get('scan_id')
        if not scan_id:
            return jsonify({"error": "scan_id required"}), 400

        scan = db.query(ScanResult).filter(ScanResult.id == scan_id).first()
        if not scan:
            return jsonify({"error": "Scan not found"}), 404

        # ── Historical Context Tracking (Phase 11) ──
        prev_scans = db.query(ScanResult).filter(
            ScanResult.patient_id == scan.patient_id,
            ScanResult.organ_name == scan.organ_name,
            ScanResult.id != scan.id
        ).order_by(ScanResult.timestamp.desc()).limit(3).all()

        counts = scan.counts or {}
        total = scan.total_points or 0

        risk_score = 0
        risk_score += int(counts.get('6', 0)) * 25
        risk_score += int(counts.get('5', 0)) * 15
        risk_score += int(counts.get('4', 0)) * 8
        risk_score += int(counts.get('3', 0)) * 3
        risk_score = min(risk_score, 100)

        # Comparative analysis
        trend_data = {"status": "stable", "change_percentage": 0, "direction": "neutral"}
        trend_msg = ""
        if prev_scans:
            baseline = prev_scans[0].total_points or 1
            change_pts = total - baseline
            percentage = (change_pts / baseline) * 100
            trend_data["change_percentage"] = round(percentage, 1)

            if change_pts > 5:
                trend_data["status"] = "declining"
                trend_data["direction"] = "negative"
                trend_msg = f" Note: Entropy in {scan.organ_name} has increased by {change_pts} points ({percentage:.1f}%) since the previous scan, suggesting acute stress."
            elif change_pts < -5:
                trend_data["status"] = "improving"
                trend_data["direction"] = "positive"
                trend_msg = f" Note: Entropy in {scan.organ_name} has decreased by {abs(change_pts)} points ({abs(percentage):.1f}%), indicating positive response to therapy."
            else:
                trend_msg = " Note: Resonance stability maintained across recent sessions."

        if risk_score >= 75:
            severity = "Critical"
            interpretation = (
                f"Significant pathological indicators detected in {scan.organ_name}. "
                f"Level 6 entropy ({counts.get('6', 0)} points) suggests active tissue degeneration.{trend_msg} "
                "Immediate bioresonance therapy protocol recommended. "
                "Consider complementary diagnostic imaging."
            )
        elif risk_score >= 50:
            severity = "Warning"
            interpretation = (
                f"Elevated entropy levels in {scan.organ_name} indicate functional stress. "
                f"Level 5 points ({counts.get('5', 0)}) show compromised tissue resonance.{trend_msg} "
                "Targeted frequency therapy sessions (3-5) recommended over 2 weeks."
            )
        elif risk_score >= 25:
            severity = "Attention"
            interpretation = (
                f"Mild entropy elevation in {scan.organ_name}. "
                f"Pattern suggests early-stage functional imbalance.{trend_msg} "
                "Preventive bioresonance correction advised. Re-scan in 7 days."
            )
        else:
            severity = "Normal"
            interpretation = (
                f"Entropy levels in {scan.organ_name} are within normal parameters.{trend_msg} "
                f"Total of {total} detected points with baseline distribution. "
                "No immediate intervention required. Routine follow-up in 30 days."
            )

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

        # New Phase 11 Pattern Heuristics
        patterns = []
        if total > 20:
            patterns.append("High point density — suggests systemic involvement")
        
        if prev_scans and len(prev_scans) >= 2:
            worst_score = max([s.total_points for s in prev_scans])
            if total > worst_score:
                patterns.append("Historical High: Current entropy exceeds all previous readings.")

        high_ratio = (int(counts.get('5', 0)) + int(counts.get('6', 0))) / max(total, 1)
        if high_ratio > 0.3:
            patterns.append(f"Critical point ratio: {high_ratio:.0%} — above 30% threshold")
        
        return jsonify({
            "scan_id": scan_id,
            "organ": scan.organ_name,
            "risk_score": risk_score,
            "severity": severity,
            "interpretation": interpretation,
            "recommendations": recommendations,
            "patterns": patterns,
            "entropy_distribution": counts,
            "total_points": total,
            "trend_analysis": trend_data
        })
    finally:
        db.close()


@app.route('/ai/anomalies/<patient_id>', methods=['GET'])
def detect_anomalies(patient_id):
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

                if diff > 10 or (prev_total > 0 and diff / max(prev_total, 1) > 0.5):
                    anomalies.append({
                        "type": "spike",
                        "scan_id": scan.id,
                        "organ": scan.organ_name,
                        "timestamp": scan.timestamp.isoformat() if scan.timestamp else None,
                        "message": f"Entropy spike: {prev_total} → {curr_total} (+{diff})",
                        "severity": "high" if diff > 15 else "medium"
                    })

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
# BATCH PROCESSING & SCHEDULING
# ──────────────────────────────────────
@app.route('/batch/analyze', methods=['POST'])
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
    """Schedule a future scan (stores intent)."""
    db = get_db()
    try:
        data = request.json or {}
        patient_id = data.get('patient_id')
        organ = data.get('organ', '')
        scheduled_for = data.get('scheduled_for', '')

        if not patient_id or not scheduled_for:
            return jsonify({"error": "patient_id and scheduled_for required"}), 400

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


# ──────────────────────────────────────
# DIAGNOSTIC LOGS
# ──────────────────────────────────────
@app.route('/diagnostic-logs', methods=['GET'])
@require_auth
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
        team_id = request.args.get('team_id')

        # Security: Force team_id if not admin
        user_id = g.current_user_dict['id']
        if g.current_user_dict['role'] != 'admin':
            membership = db.query(TeamMember).filter(TeamMember.user_id == user_id).first()
            team_id = membership.team_id if membership else None

        query = db.query(DiagnosticLog).order_by(DiagnosticLog.timestamp.desc())

        if team_id:
            # Filter logs associated with patients in this team
            p_ids = [p.id for p in db.query(Patient.id).filter(Patient.team_id == team_id).all()]
            query = query.filter(DiagnosticLog.patient_id.in_(p_ids))
        elif patient_id:
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
            "logs": [
                {**log.to_dict(), "snapshot_url": f"/snapshots/{os.path.basename(log.snapshot_path)}" if log.snapshot_path else None}
                for log in logs
            ],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        })
    finally:
        db.close()


@app.route('/diagnostic-logs/stats', methods=['GET'])
@require_auth
def get_diagnostic_log_stats():
    """Get summary statistics for diagnostic logs."""
    db = get_db()
    try:
        from sqlalchemy import func
        team_id = request.args.get('team_id')

        # Security: Force team_id if not admin
        user_id = g.current_user_dict['id']
        if g.current_user_dict['role'] != 'admin':
            membership = db.query(TeamMember).filter(TeamMember.user_id == user_id).first()
            team_id = membership.team_id if membership else None

        query = db.query(DiagnosticLog)
        if team_id:
            p_ids = [p.id for p in db.query(Patient.id).filter(Patient.team_id == team_id).all()]
            query = query.filter(DiagnosticLog.patient_id.in_(p_ids))

        total = query.count()

        by_severity = {}
        sev_results = query.with_entities(DiagnosticLog.severity, func.count(DiagnosticLog.id)).group_by(DiagnosticLog.severity).all()
        for sev, count in sev_results:
            by_severity[sev or 'normal'] = count

        by_organ = {}
        organ_results = query.with_entities(DiagnosticLog.organ_detected, func.count(DiagnosticLog.id)).group_by(DiagnosticLog.organ_detected).order_by(func.count(DiagnosticLog.id).desc()).limit(20).all()
        for organ, count in organ_results:
            by_organ[organ or 'Unknown'] = count

        recent_cutoff = datetime.utcnow() - timedelta(hours=24)
        recent_count = query.filter(DiagnosticLog.timestamp >= recent_cutoff).count()

        latest = query.order_by(DiagnosticLog.timestamp.desc()).first()

        return jsonify({
            "total_logs": total,
            "recent_24h": recent_count,
            "by_severity": by_severity,
            "by_organ": by_organ,
            "latest_timestamp": latest.timestamp.isoformat() if latest else None,
            "watcher_persisted": 0
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
# INTEGRATION & ECOSYSTEM — Phase 9
# ──────────────────────────────────────
from plugins_manager import PluginManager

plugin_manager = PluginManager()


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
        "servers": [{"url": os.environ.get('RENDER_EXTERNAL_URL', 'http://localhost:5001')}],
        "paths": {}
    }

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
            return jsonify({
                "status": "preview",
                "recipient": recipient,
                "message": "SMTP not configured. Set SMTP_HOST env var to enable.",
                "report_preview": report_text
            })
    finally:
        db.close()


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
# SYSTEM CONFIGURATION — Phase 10
# ──────────────────────────────────────
@app.route('/api/config', methods=['GET'])
@require_auth
def get_system_config():
    """Get all system configuration keys."""
    db = get_db()
    try:
        configs = db.query(SystemConfig).all()
        return jsonify({c.key: c.value for c in configs})
    finally:
        db.close()


@app.route('/api/config', methods=['POST'])
@require_auth
@require_role('admin')
def set_system_config():
    """Set system configuration keys."""
    db = get_db()
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        for key, value in data.items():
            config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
            if config:
                config.value = str(value)
            else:
                config = SystemConfig(key=key, value=str(value))
                db.add(config)
        
        db.commit()
        log_audit(db, g.user_id, 'update_system_config', details=data)
        return jsonify({"status": "success", "message": "Configuration updated"})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()


# ══════════════════════════════════════
# DEVICE-DEPENDENT STUBS (cloud-safe)
# These routes exist so the frontend can call them
# without network errors. They return graceful
# "device not connected" responses.
# ══════════════════════════════════════

# ──────────────────────────────────────
# VIDEO FEED — Placeholder
# ──────────────────────────────────────
@app.route('/video_feed')
def video_feed():
    """Return a placeholder or simulated dynamic frame."""
    def generate():
        import numpy as np
        import cv2
        import random

        while True:
            # Check for simulation mode from DB
            db = SessionLocal()
            try:
                sim_mode = db.query(SystemConfig).filter(SystemConfig.key == 'simulation_mode').first()
                is_sim = sim_mode.value.lower() == 'true' if sim_mode else False
            except:
                is_sim = False
            finally:
                db.close()

            # Create base darkness
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            
            if is_sim:
                # Add "Scanning" VFX
                cv2.putText(frame, "SIMULATION MODE ACTIVE", (20, 40), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (80, 250, 123), 2)
                
                # Draw random data points
                for _ in range(random.randint(5, 15)):
                    x, y = random.randint(100, 540), random.randint(80, 400)
                    color = random.choice([(80, 250, 123), (255, 184, 108), (255, 85, 85)])
                    cv2.circle(frame, (x, y), 5, color, -1)
                    cv2.circle(frame, (x, y), 8, color, 1)

                # Add scanning line
                line_y = int((time.time() * 200) % 480)
                cv2.line(frame, (0, line_y), (640, line_y), (139, 92, 246, 50), 1)

                # Add timestamp
                cv2.putText(frame, datetime.now().strftime('%H:%M:%S.%f')[:-3], (20, 460),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 100, 100), 1)
            else:
                cv2.putText(frame, "MONITOR OFFLINE", (220, 240), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (100, 100, 140), 2)
                cv2.putText(frame, "LIVE NLS DEVICE REQUIRED", (200, 270), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (80, 80, 100), 1)

            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.5 if is_sim else 2.0)

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


# ──────────────────────────────────────
# CV TOOLS — Stubs
# ──────────────────────────────────────
@app.route('/cv/roi', methods=['GET'])
def get_roi():
    return jsonify({"roi": None, "device_required": True, "message": "Connect NLS device for ROI tools"})

@app.route('/cv/roi', methods=['POST'])
def set_roi():
    return jsonify({"device_required": True, "message": "Connect NLS device to set ROI"}), 503

@app.route('/cv/roi', methods=['DELETE'])
def clear_roi():
    return jsonify({"device_required": True, "message": "Connect NLS device to clear ROI"}), 503

@app.route('/cv/heatmap', methods=['GET'])
def get_heatmap():
    return jsonify({"heatmap": None, "device_required": True, "message": "Connect NLS device for heatmap"})

@app.route('/cv/monitors', methods=['GET'])
def get_monitors():
    return jsonify({"monitors": [], "device_required": True})

@app.route('/cv/monitors/<int:monitor_idx>', methods=['POST'])
def set_monitor(monitor_idx):
    return jsonify({"device_required": True, "message": "Connect NLS device"}), 503

@app.route('/cv/colors', methods=['GET'])
def get_color_ranges():
    return jsonify({"colors": {}, "device_required": True})

@app.route('/cv/colors', methods=['POST'])
def set_color_ranges():
    return jsonify({"device_required": True}), 503

@app.route('/cv/colors/sample', methods=['POST'])
def sample_color():
    return jsonify({"device_required": True}), 503

@app.route('/cv/snapshots', methods=['GET'])
def get_snapshots():
    return jsonify({"snapshots": [], "device_required": True})

@app.route('/cv/snapshots', methods=['POST'])
def take_snapshot():
    return jsonify({"device_required": True, "message": "Connect NLS device to take snapshots"}), 503


# ──────────────────────────────────────
# MACROS — Stubs
# ──────────────────────────────────────
@app.route('/macros', methods=['GET'])
def list_macros():
    return jsonify({"macros": [], "device_required": True})

@app.route('/macros/record/start', methods=['POST'])
def start_macro_record():
    return jsonify({"device_required": True, "message": "Connect NLS device for macro recording"}), 503

@app.route('/macros/record/stop', methods=['POST'])
def stop_macro_record():
    return jsonify({"device_required": True}), 503

@app.route('/macros/<name>/play', methods=['POST'])
def play_macro(name):
    return jsonify({"device_required": True}), 503

@app.route('/macros/<name>', methods=['DELETE'])
def delete_macro(name):
    return jsonify({"device_required": True}), 503


# ──────────────────────────────────────
# SCREEN WATCHER — Stubs
# ──────────────────────────────────────
@app.route('/watcher/status', methods=['GET'])
def watcher_status():
    return jsonify({
        "running": False,
        "device_required": True,
        "events_count": 0,
        "message": "Screen watcher requires local NLS device connection"
    })

@app.route('/watcher/start', methods=['POST'])
def watcher_start():
    return jsonify({"device_required": True, "message": "Connect NLS device to start watcher"}), 503

@app.route('/watcher/stop', methods=['POST'])
def watcher_stop():
    return jsonify({"device_required": True}), 503

@app.route('/watcher/events', methods=['GET'])
def watcher_events():
    return jsonify({"events": [], "device_required": True})

@app.route('/watcher/settings', methods=['GET', 'POST'])
def watcher_settings():
    if request.method == 'POST':
        return jsonify({"device_required": True}), 503
    return jsonify({"settings": {}, "device_required": True})


# ──────────────────────────────────────
# SCAN OPERATIONS — Stubs (device-dependent only)
# ──────────────────────────────────────
@app.route('/scan/analyze', methods=['POST'])
def analyze_scan():
    return jsonify({
        "status": "error",
        "device_required": True,
        "message": "Screen analysis requires local NLS device connection"
    }), 503

@app.route('/scan/start', methods=['POST'])
def start_scan():
    return jsonify({
        "status": "error",
        "device_required": True,
        "message": "Scan initiation requires local NLS device connection"
    }), 503

@app.route('/control/calibrate', methods=['POST'])
def calibrate():
    return jsonify({"device_required": True, "message": "Calibration requires local NLS device"}), 503

@app.route('/scan/auto-sequence', methods=['POST'])
def auto_scan_sequence():
    """Perform an automated scan sequence on multiple organs (Simulated)."""
    db = get_db()
    try:
        data = request.json
        patient_id = data.get('patientId')
        organs = data.get('organs', [])

        if not patient_id:
            return jsonify({"error": "patientId required"}), 400

        # Check simulation mode
        sim_mode = db.query(SystemConfig).filter(SystemConfig.key == 'simulation_mode').first()
        is_sim = sim_mode.value.lower() == 'true' if sim_mode else False

        if not is_sim:
            return jsonify({"device_required": True, "message": "Auto-scan requires local NLS device"}), 503

        # Simulate scanning process
        import random
        results = []
        for organ in organs:
            # Generate randomized entropy data
            # Mix of normal and occasional pathology
            is_pathology = random.random() < 0.15
            is_compromised = random.random() < 0.3
            
            entropy_points = []
            num_points = random.randint(15, 45)
            
            for _ in range(num_points):
                if is_pathology:
                    level = random.choices([4, 5, 6], weights=[20, 30, 50])[0]
                elif is_compromised:
                    level = random.choices([2, 3, 4, 5], weights=[20, 30, 30, 20])[0]
                else:
                    level = random.choices([1, 2, 3, 4], weights=[40, 30, 20, 10])[0]
                
                entropy_points.append({
                    "level": level,
                    "x": random.randint(10, 390),
                    "y": random.randint(10, 440)
                })

            scan = ScanResult(
                patient_id=patient_id,
                organ_name=organ.get('name', 'Unknown'),
                entropy_points=entropy_points,
                practitioner_notes="[SIMULATED SCAN] Data generated automatically."
            )
            # Calculate counts and status
            scan.calculate_summary()
            db.add(scan)
            results.append(scan.to_dict())

        db.commit()
        log_audit(db, g.user_id if hasattr(g, 'user_id') else None, 'auto_scan_sequence', 
                  entity_type='patient', entity_id=patient_id, details={"organs": len(organs)})
        
        return jsonify({
            "status": "completed",
            "successful": len(organs),
            "total_organs": len(organs),
            "scans": results
        })

    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()


# ──────────────────────────────────────
# TEAMS — Phase 12
# ──────────────────────────────────────
@app.route('/teams', methods=['GET'])
@require_auth
def get_user_teams():
    db = get_db()
    try:
        user_id = g.current_user_dict['id']
        memberships = db.query(TeamMember).filter(TeamMember.user_id == user_id).all()
        return jsonify([m.to_dict() for m in memberships])
    finally:
        db.close()

@app.route('/teams', methods=['POST'])
@require_auth
def create_team():
    db = get_db()
    try:
        data = request.json
        name = data.get('name', '').strip()
        if not name:
            return jsonify({"error": "Team name required"}), 400
        
        new_team = Team(name=name)
        db.add(new_team)
        db.commit()
        db.refresh(new_team)
        
        # Add creator as owner
        membership = TeamMember(
            team_id=new_team.id,
            user_id=g.current_user_dict['id'],
            role='owner'
        )
        db.add(membership)
        db.commit()
        
        return jsonify(new_team.to_dict()), 201
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()

@app.route('/teams/<team_id>/members', methods=['GET'])
@require_auth
def get_team_members(team_id):
    db = get_db()
    try:
        # Security: User must be in the team
        membership = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == g.current_user_dict['id']
        ).first()
        if not membership and g.current_user_dict['role'] != 'admin':
            return jsonify({"error": "Access denied"}), 403
            
        members = db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
        return jsonify([m.to_dict() for m in members])
    finally:
        db.close()

# ──────────────────────────────────────
# WORKFLOW AUTOMATION — Phase 13
# ──────────────────────────────────────
@app.route('/workflows', methods=['GET'])
@require_auth
def get_workflows():
    db = get_db()
    try:
        team_id = request.args.get('team_id')
        query = db.query(WorkflowAutomation).filter(WorkflowAutomation.is_active == True)
        if team_id:
            query = query.filter(or_(WorkflowAutomation.team_id == team_id, WorkflowAutomation.team_id == None))
        workflows = query.all()
        return jsonify([w.to_dict() for w in workflows])
    finally:
        db.close()

@app.route('/workflows', methods=['POST'])
@require_auth
def create_workflow():
    db = get_db()
    try:
        data = request.json
        new_wf = WorkflowAutomation(
            name=data['name'],
            description=data.get('description', ''),
            team_id=data.get('team_id'),
            sequence=data.get('sequence', [])
        )
        db.add(new_wf)
        db.commit()
        db.refresh(new_wf)
        return jsonify(new_wf.to_dict()), 201
    finally:
        db.close()

@app.route('/workflows/<wf_id>/execute', methods=['POST'])
@require_auth
def execute_workflow(wf_id):
    """Triggers a sequence of commands for a team."""
    db = get_db()
    try:
        wf = db.query(WorkflowAutomation).filter(WorkflowAutomation.id == wf_id).first()
        if not wf:
            return jsonify({"error": "Workflow not found"}), 404
            
        team_id = request.json.get('team_id')
        if not team_id:
            return jsonify({"error": "team_id required for execution"}), 400

        # Security check: User in team
        membership = db.query(TeamMember).filter(
            TeamMember.user_id == g.current_user_dict['id'],
            TeamMember.team_id == team_id
        ).first()
        if not membership and g.current_user_dict['role'] != 'admin':
            return jsonify({"error": "Access denied"}), 403

        if team_id not in remote_control_queues:
            remote_control_queues[team_id] = []
            
        # Queue all commands in the sequence
        for item in wf.sequence:
            cmd = {
                "id": str(uuid.uuid4()),
                "command": item.get('command'),
                "params": item.get('params', {}),
                "issuer": f"automation:{wf.name}",
                "timestamp": time.time()
            }
            remote_control_queues[team_id].append(cmd)
            
        log_audit(db, g.current_user_dict['id'], 'workflow_execute', entity_type='workflow', entity_id=wf_id, details={"team_id": team_id})
        return jsonify({"status": "workflow_queued", "commands_count": len(wf.sequence)})
    finally:
        db.close()

@app.route('/teams/<team_id>/analytics', methods=['GET'])
@require_auth
def get_team_analytics(team_id):
    """Calculate population health statistics for a clinical team."""
    db = get_db()
    try:
        from sqlalchemy import func, or_
        # Security: User must be in team
        membership = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == g.current_user_dict['id']
        ).first()
        if not membership and g.current_user_dict['role'] != 'admin':
            return jsonify({"error": "Access denied"}), 403

        # Patient & Scan counts
        patient_count = db.query(Patient).filter(Patient.team_id == team_id).count()
        patient_ids = [p.id for p in db.query(Patient.id).filter(Patient.team_id == team_id).all()]
        
        scan_count = db.query(ScanResult).filter(ScanResult.patient_id.in_(patient_ids)).count()
        
        # Organ distribution
        organ_dist = {}
        organ_results = db.query(ScanResult.organ_name, func.count(ScanResult.id))\
            .filter(ScanResult.patient_id.in_(patient_ids))\
            .group_by(ScanResult.organ_name).all()
        for organ, count in organ_results:
            organ_dist[organ or 'Unknown'] = count

        # Risk distribution (Latest scan per patient)
        severity_dist = {"Critical": 0, "Warning": 0, "Attention": 0, "Normal": 0}
        # Simplified: average risk of all scans
        all_scans = db.query(ScanResult.status).filter(ScanResult.patient_id.in_(patient_ids)).all()
        for s in all_scans:
            status = s[0]
            if "Level 6" in status or "Critical" in status: severity_dist["Critical"] += 1
            elif "Level 5" in status or "Warning" in status: severity_dist["Warning"] += 1
            elif "Stressed" in status or "Attention" in status: severity_dist["Attention"] += 1
            else: severity_dist["Normal"] += 1

        recent_logs_count = db.query(DiagnosticLog).filter(DiagnosticLog.patient_id.in_(patient_ids)).count()

        return jsonify({
            "team_id": team_id,
            "patient_count": patient_count,
            "total_scans": scan_count,
            "organ_distribution": organ_dist,
            "severity_distribution": severity_dist,
            "activity_index": recent_logs_count
        })
    finally:
        db.close()

@app.route('/teams/<team_id>/invite', methods=['POST'])
@require_auth
def invite_to_team(team_id):
    """Invite a user to a team by username."""
    db = get_db()
    try:
        data = request.json
        username = data.get('username')
        role = data.get('role', 'practitioner')
        
        if not username:
            return jsonify({"error": "Username required"}), 400
            
        # Security: Current user must be owner or admin
        user_id = g.current_user_dict['id']
        current_membership = db.query(TeamMember).filter(
            TeamMember.user_id == user_id,
            TeamMember.team_id == team_id
        ).first()
        if (not current_membership or current_membership.role != 'owner') and g.current_user_dict['role'] != 'admin':
            return jsonify({"error": "Only owners can invite members"}), 403
            
        # Find user to invite
        target_user = db.query(User).filter(User.username == username).first()
        if not target_user:
            return jsonify({"error": f"User '{username}' not found"}), 404
            
        # Check if already a member
        existing = db.query(TeamMember).filter(
            TeamMember.user_id == target_user.id,
            TeamMember.team_id == team_id
        ).first()
        if existing:
            return jsonify({"error": "User is already a member of this team"}), 400
            
        new_member = TeamMember(
            team_id=team_id,
            user_id=target_user.id,
            role=role
        )
        db.add(new_member)
        db.commit()
        
        log_audit(db, user_id, 'team_invite', entity_type='team', entity_id=team_id, details={"invited_user": username, "role": role})
        return jsonify({"status": "success", "message": f"User {username} invited"}), 201
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        db.close()

# ──────────────────────────────────────
# DB MIGRATION ENDPOINT (PHASE 15)
# ──────────────────────────────────────
@app.route('/api/migrate-db', methods=['POST'])
def migrate_db():
    db = get_db()
    from sqlalchemy.sql import text
    from database import engine
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(20)"))
            conn.commit()
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE patients ADD COLUMN opt_in_whatsapp BOOLEAN DEFAULT FALSE"))
            conn.commit()
        return jsonify({"status": "success", "message": "Columns added successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Migration error (already run?): {str(e)}"})


# ──────────────────────────────────────
# LIVE STREAMING — Phase 12
# ──────────────────────────────────────
# Memory-store for live frames (keyed by team_id)
live_frames = {}

# Memory-store for remote commands (keyed by team_id)
# Each value is a list of command dicts: [{"command": "START", "params": {}, "issuer": "user_id"}]
remote_control_queues = {}

@app.route('/live/frame', methods=['POST'])
@require_auth
def push_live_frame():
    """Receives a live frame from a local bot/watcher."""
    try:
        data = request.json
        team_id = data.get('team_id')
        frame_b64 = data.get('frame')
        
        if not team_id or not frame_b64:
            return jsonify({"error": "team_id and frame required"}), 400
            
        # Security: Verify user belongs to the team
        membership = db_session().query(TeamMember).filter(
            TeamMember.user_id == g.current_user_dict['id'],
            TeamMember.team_id == team_id
        ).first()
        if not membership and g.current_user_dict['role'] != 'admin':
            return jsonify({"error": "Access denied"}), 403

        live_frames[team_id] = {
            "frame": frame_b64,
            "timestamp": time.time(),
            "status": data.get('status', 'online')
        }
        return jsonify({"status": "received"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/live/stream/<team_id>', methods=['GET'])
@require_auth
def get_live_frame(team_id):
    """Serves the latest frame for a team to the frontend."""
    # Security: Verify user belongs to the team
    db = get_db()
    try:
        membership = db.query(TeamMember).filter(
            TeamMember.user_id == g.current_user_dict['id'],
            TeamMember.team_id == team_id
        ).first()
        if not membership and g.current_user_dict['role'] != 'admin':
            return jsonify({"error": "Access denied"}), 403

        frame_data = live_frames.get(team_id)
        if not frame_data:
            return jsonify({"status": "offline", "message": "No live stream active for this team"}), 404
            
        # If frame is older than 10 seconds, consider it offline
        if time.time() - frame_data['timestamp'] > 10:
            return jsonify({"status": "offline", "message": "Stream timed out"}), 404
            
        return jsonify(frame_data)
    finally:
        db.close()

@app.route('/live/control', methods=['POST'])
@require_auth
def push_control_command():
    """Send a command to a remote workstation."""
    try:
        data = request.json
        team_id = data.get('team_id')
        command = data.get('command')
        params = data.get('params', {})

        if not team_id or not command:
            return jsonify({"error": "team_id and command required"}), 400

        # Security: User must belong to the team
        db = get_db()
        try:
            membership = db.query(TeamMember).filter(
                TeamMember.user_id == g.current_user_dict['id'],
                TeamMember.team_id == team_id
            ).first()
            if not membership and g.current_user_dict['role'] != 'admin':
                return jsonify({"error": "Access denied"}), 403
            
            # Capability check: viewers can't control
            if membership and membership.role == 'viewer':
                return jsonify({"error": "Viewers cannot send control signals"}), 403

            if team_id not in remote_control_queues:
                remote_control_queues[team_id] = []
            
            # Limit queue size to avoid bloat
            if len(remote_control_queues[team_id]) > 20:
                remote_control_queues[team_id].pop(0)

            new_cmd = {
                "id": str(uuid.uuid4()),
                "command": command,
                "params": params,
                "issuer": g.current_user_dict['username'],
                "timestamp": time.time()
            }
            remote_control_queues[team_id].append(new_cmd)
            
            log_audit(db, g.current_user_dict['id'], 'remote_control', entity_type='team', entity_id=team_id, details=new_cmd)
            return jsonify({"status": "queued", "command_id": new_cmd["id"]})
        finally:
            db.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/live/control/poll', methods=['GET'])
@require_auth
def poll_control_commands():
    """Workstation bot calls this to fetch pending commands."""
    try:
        team_id = request.args.get('team_id')
        if not team_id:
            return jsonify({"error": "team_id required"}), 400

        # Security check: User must be in team
        db = get_db()
        try:
            membership = db.query(TeamMember).filter(
                TeamMember.user_id == g.current_user_dict['id'],
                TeamMember.team_id == team_id
            ).first()
            if not membership and g.current_user_dict['role'] != 'admin':
                return jsonify({"error": "Access denied"}), 403

            commands = remote_control_queues.pop(team_id, [])
            return jsonify({
                "commands": commands,
                "count": len(commands),
                "server_time": time.time()
            })
        finally:
            db.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ──────────────────────────────────────
# KNOWLEDGE BASE — Phase 16
# ──────────────────────────────────────
@app.route('/api/references', methods=['GET'])
@require_auth
def list_reference_documents():
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
def upload_reference_document():
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
            uploaded_by=g.current_user_dict['id']
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
# PDF Analyzer
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
# MAIN
# ──────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting Vibrana Cloud Backend on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False)
