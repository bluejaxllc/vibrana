import sqlite3
conn = sqlite3.connect('vibrana.db')
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', tables)
has_message_logs = 'message_logs' in tables
print(f'message_logs exists: {has_message_logs}')

# Quick test: can we query patients and their scans?
from database import init_db, SessionLocal
from models import Patient, ScanResult, DiagnosticLog
init_db()
db = SessionLocal()

# Test just scans (no lazy loading of messages)
p = db.query(Patient).first()
print(f'Patient: {p.name}')
scans = db.query(ScanResult).filter(ScanResult.patient_id == p.id).all()
print(f'Scans queried directly: {len(scans)}')

# Test DiagnosticLog
try:
    diags = db.query(DiagnosticLog).filter(DiagnosticLog.patient_id == p.id).all()
    print(f'DiagnosticLogs: {len(diags)}')
except Exception as e:
    print(f'DiagnosticLog query FAILED: {e}')

# Now test the dangerous call: patient.to_dict() which may trigger lazy load of messages
try:
    d = p.to_dict()
    print(f'to_dict OK: {list(d.keys())}')
except Exception as e:
    print(f'to_dict FAILED: {e}')

db.close()
conn.close()
