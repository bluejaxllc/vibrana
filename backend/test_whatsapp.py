"""
Vibrana WhatsApp Integration Test Script
Supports both SQLite (local) and PostgreSQL (cloud) via DATABASE_URL env var.
"""
import os
import requests
import json
import uuid

# --- Database Setup ---
DATABASE_URL = os.environ.get('DATABASE_URL', '')
API_BASE = os.environ.get('VIBRANA_API', 'http://127.0.0.1:5001')

patient_id = str(uuid.uuid4())

if DATABASE_URL:
    # Cloud mode — use PostgreSQL via SQLAlchemy
    from sqlalchemy import create_engine, text
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO patients (id, name, age, gender, created_at, phone_number, opt_in_whatsapp, team_id) "
            "VALUES (:id, 'Edgar Test WhatsApp', 30, 'Male', NOW(), '+52 6391233367', TRUE, 'none')"
        ), {"id": patient_id})
        conn.commit()
    print(f"✅ [Cloud/PG] Test patient created: {patient_id}")
else:
    # Local mode — use SQLite
    import sqlite3
    db_path = 'vibrana.db'
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO patients (id, name, age, gender, created_at, phone_number, opt_in_whatsapp, team_id) "
        "VALUES (?, 'Edgar Test WhatsApp', 30, 'Male', datetime('now'), '+52 6391233367', 1, 'none')",
        (patient_id,)
    )
    conn.commit()
    conn.close()
    print(f"✅ [Local/SQLite] Test patient created: {patient_id}")

# --- Login ---
print("\n🔐 Logging in...")
login_res = requests.post(f'{API_BASE}/auth/login', json={"username": "admin", "password": "password"})
token = login_res.json().get('token')

if not token:
    test_uname = f"test_{uuid.uuid4().hex[:6]}"
    requests.post(f'{API_BASE}/auth/register', json={
        "username": test_uname, "password": "password",
        "role": "admin", "full_name": "Test User",
        "email": f"{test_uname}@example.com"
    })
    login_res = requests.post(f'{API_BASE}/auth/login', json={"username": test_uname, "password": "password"})
    token = login_res.json().get('token')

if not token:
    print("❌ Could not obtain auth token:", login_res.text)
    exit(1)

print(f"✅ Token obtained")

# --- Send WhatsApp Test ---
print("\n📱 Sending WhatsApp test message...")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
msg_payload = {"content": "Hello Edgar! Phase 22 WhatsApp integration test — dual-database support verified! 🚀"}

res = requests.post(f"{API_BASE}/patients/{patient_id}/whatsapp", json=msg_payload, headers=headers)
print(f"Response Status: {res.status_code}")
try:
    print(f"Response JSON: {json.dumps(res.json(), indent=2)}")
except:
    print(f"Body: {res.text}")

if res.ok:
    print("\n🎉 WhatsApp test PASSED!")
else:
    print("\n⚠️ WhatsApp test returned non-200 — check GHL webhook config")
