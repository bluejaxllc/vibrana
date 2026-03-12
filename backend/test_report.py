"""Minimal test with full traceback written to file."""
import sys
import traceback

# Redirect all output to file
f = open('test_output.txt', 'w', encoding='utf-8')
sys.stdout = f
sys.stderr = f

try:
    from database import init_db, SessionLocal
    from models import Patient
    init_db()
    db = SessionLocal()
    p = db.query(Patient).first()
    pid = p.id
    print(f"Patient: {p.name} ({pid[:12]}..., {len(p.scans)} scans)")
    db.close()

    from report_agent import gather_patient_data
    print("Calling gather_patient_data...")
    data = gather_patient_data(pid)
    print(f"Systems: {list(data.get('systems', {}).keys())}")

    from report_agent import generate_narrative_report
    print("Generating report...")
    result = generate_narrative_report(pid)
    print(f"Keys: {list(result.keys())}")
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
    traceback.print_exc()

f.close()
