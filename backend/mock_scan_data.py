"""
Vibrana Mock Scan Data Seeder
Seeds the database with realistic Metatron Hunter NLS scan data for testing.
"""
import random
import uuid
from datetime import datetime, timedelta
from database import init_db, SessionLocal
from models import Patient, ScanResult, DiagnosticLog

# ──────────────────────────────────────
# Metatron Hunter Organ Map
# ──────────────────────────────────────
ORGANS = [
    # (organ_name, system, typical_entropy_profile)
    # profile = (weight_lvl1, weight_lvl2, weight_lvl3, weight_lvl4, weight_lvl5, weight_lvl6)
    ("Hígado — Sección Longitudinal", "Digestivo", (15, 25, 30, 20, 8, 2)),
    ("Hígado — Sección Transversal", "Digestivo", (15, 25, 30, 20, 8, 2)),
    ("Riñón Derecho", "Urinario", (20, 30, 25, 15, 7, 3)),
    ("Riñón Izquierdo", "Urinario", (20, 30, 25, 15, 7, 3)),
    ("Páncreas", "Digestivo", (18, 22, 28, 20, 9, 3)),
    ("Estómago", "Digestivo", (10, 20, 30, 25, 10, 5)),
    ("Intestino Delgado", "Digestivo", (12, 18, 28, 25, 12, 5)),
    ("Intestino Grueso — Colon", "Digestivo", (12, 18, 28, 25, 12, 5)),
    ("Corazón — Vista Anterior", "Cardiovascular", (25, 30, 25, 12, 5, 3)),
    ("Corazón — Vista Posterior", "Cardiovascular", (25, 30, 25, 12, 5, 3)),
    ("Pulmón Derecho", "Respiratorio", (22, 28, 25, 15, 7, 3)),
    ("Pulmón Izquierdo", "Respiratorio", (22, 28, 25, 15, 7, 3)),
    ("Tiroides", "Endocrino", (20, 25, 25, 18, 8, 4)),
    ("Hipófisis", "Endocrino", (25, 30, 25, 12, 5, 3)),
    ("Glándula Suprarrenal Derecha", "Endocrino", (18, 22, 28, 20, 8, 4)),
    ("Glándula Suprarrenal Izquierda", "Endocrino", (18, 22, 28, 20, 8, 4)),
    ("Vesícula Biliar", "Digestivo", (15, 20, 25, 22, 12, 6)),
    ("Bazo", "Linfático", (20, 25, 28, 18, 6, 3)),
    ("Columna Cervical", "Musculoesquelético", (15, 22, 28, 22, 9, 4)),
    ("Columna Lumbar", "Musculoesquelético", (12, 18, 28, 25, 12, 5)),
    ("Cerebro — Hemisferio Derecho", "Nervioso", (25, 30, 25, 12, 5, 3)),
    ("Cerebro — Hemisferio Izquierdo", "Nervioso", (25, 30, 25, 12, 5, 3)),
    ("Próstata / Útero", "Reproductivo", (20, 25, 25, 18, 8, 4)),
    ("Vejiga", "Urinario", (22, 28, 25, 15, 7, 3)),
    ("Articulación Rodilla Derecha", "Musculoesquelético", (15, 22, 28, 22, 9, 4)),
    ("Ojo Derecho — Retina", "Sensorial", (25, 30, 25, 12, 5, 3)),
    ("Oído Interno", "Sensorial", (25, 30, 25, 12, 5, 3)),
]

# ──────────────────────────────────────
# Sample Patients
# ──────────────────────────────────────
PATIENTS = [
    {"name": "María García López", "age": 68, "gender": "Femenino",
     "notes": "Paciente con antecedentes de hipertensión. Sesiones semanales de biorresonancia."},
    {"name": "Roberto Hernández Díaz", "age": 54, "gender": "Masculino",
     "notes": "Refiere dolor lumbar crónico y fatiga. Primera visita hace 3 meses."},
    {"name": "Carmen Rodríguez Vega", "age": 42, "gender": "Femenino",
     "notes": "Problemas digestivos recurrentes. Seguimiento quincenal."},
    {"name": "Francisco Torres Sánchez", "age": 71, "gender": "Masculino",
     "notes": "Diabético tipo 2. Control regular de función renal y hepática."},
    {"name": "Ana Luisa Mendoza", "age": 35, "gender": "Femenino",
     "notes": "Estrés crónico, insomnio. Evaluación de sistema nervioso y endocrino."},
]


def generate_entropy_points(organ_profile, num_points=None, severity_bias=0):
    """
    Generate realistic entropy points based on organ's typical profile.
    severity_bias: 0 = normal, positive = more pathological, negative = healthier
    """
    if num_points is None:
        num_points = random.randint(8, 25)

    weights = list(organ_profile)
    # Apply severity bias
    if severity_bias > 0:
        # Shift weight toward higher entropy levels
        for i in range(len(weights)):
            if i >= 3:
                weights[i] = int(weights[i] * (1 + severity_bias * 0.3))
            else:
                weights[i] = max(1, int(weights[i] * (1 - severity_bias * 0.15)))
    elif severity_bias < 0:
        # Shift weight toward lower entropy levels
        for i in range(len(weights)):
            if i < 3:
                weights[i] = int(weights[i] * (1 + abs(severity_bias) * 0.3))
            else:
                weights[i] = max(1, int(weights[i] * (1 - abs(severity_bias) * 0.2)))

    levels = [1, 2, 3, 4, 5, 6]
    points = []
    for _ in range(num_points):
        level = random.choices(levels, weights=weights, k=1)[0]
        points.append({
            "level": level,
            "x": random.randint(50, 500),
            "y": random.randint(50, 400),
            "color": ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#7c2d12"][level - 1]
        })
    return points


def seed_database():
    """Create patients and populate with realistic scan history."""
    init_db()
    db = SessionLocal()

    try:
        # Check if data already exists
        existing = db.query(Patient).count()
        if existing > 0:
            print(f"⚠️  Database already has {existing} patients. Skipping seed.")
            print("   To re-seed, delete vibrana.db first.")
            return

        print("🌱 Seeding Vibrana database with mock NLS data...\n")

        for patient_data in PATIENTS:
            patient = Patient(
                name=patient_data["name"],
                age=patient_data["age"],
                gender=patient_data["gender"],
                notes=patient_data["notes"],
            )
            db.add(patient)
            db.flush()  # Get the ID

            print(f"  👤 {patient.name} (ID: {patient.id[:8]}...)")

            # Generate 3-5 sessions, each with 4-8 organ scans
            num_sessions = random.randint(3, 5)
            base_date = datetime.utcnow() - timedelta(days=num_sessions * 7)

            # Patient-specific severity profile
            # Some patients are healthier, some have issues
            patient_severity = random.uniform(-0.5, 1.5)

            for session in range(num_sessions):
                session_date = base_date + timedelta(days=session * 7, hours=random.randint(9, 17))

                # Pick random organs for this session
                session_organs = random.sample(ORGANS, k=random.randint(4, 8))

                # Severity trends over time (improvement or worsening)
                trend = random.choice([-0.2, -0.1, 0, 0.1, 0.2])
                session_severity = patient_severity + (trend * session)

                for organ_name, system, profile in session_organs:
                    # Add some organ-specific variation
                    organ_bias = session_severity + random.uniform(-0.3, 0.3)
                    points = generate_entropy_points(profile, severity_bias=organ_bias)

                    scan = ScanResult(
                        patient_id=patient.id,
                        organ_name=organ_name,
                        timestamp=session_date + timedelta(minutes=random.randint(0, 45)),
                        entropy_points=points,
                    )
                    scan.calculate_summary()
                    db.add(scan)

                    # Also create a diagnostic log for some scans
                    if random.random() > 0.4:
                        diag = DiagnosticLog(
                            patient_id=patient.id,
                            timestamp=scan.timestamp,
                            event_type='manual_scan',
                            organ_detected=organ_name,
                            header_text=organ_name,
                            summary_text=f"Escaneo de {organ_name} — {scan.status}",
                            entropy_analysis={
                                "total_points": scan.total_points,
                                "counts": scan.counts,
                                "status": scan.status,
                                "organ_name": organ_name,
                                "system": system,
                            },
                            severity='critical' if 'Pathol' in scan.status else
                                     'warning' if 'Comprom' in scan.status else
                                     'attention' if 'Stress' in scan.status else 'normal',
                        )
                        db.add(diag)

                print(f"    📅 Sesión {session + 1}: {len(session_organs)} órganos escaneados")

            print()

        db.commit()

        # Print summary
        total_patients = db.query(Patient).count()
        total_scans = db.query(ScanResult).count()
        total_diags = db.query(DiagnosticLog).count()

        print(f"✅ Seed complete!")
        print(f"   👤 Pacientes: {total_patients}")
        print(f"   🔬 Escaneos:  {total_scans}")
        print(f"   📋 Diagnósticos: {total_diags}")

        # Print first patient's ID for testing
        first = db.query(Patient).first()
        if first:
            print(f"\n   🧪 Test with: GET /patients/{first.id}/ai-report")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == '__main__':
    seed_database()
