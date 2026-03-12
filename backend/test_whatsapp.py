import sqlite3
import requests
import json
import uuid

# Create a test patient directly
db_path = 'vibrana.db'
conn = sqlite3.connect(db_path)
patient_id = str(uuid.uuid4())
conn.execute("INSERT INTO patients (id, name, age, gender, created_at, phone_number, opt_in_whatsapp, team_id) VALUES (?, 'Edgar Test WhatsApp', 30, 'Male', datetime('now'), '+52 6391233367', 1, 'none')", (patient_id,))
conn.commit()
conn.close()

# Login to get a token and trigger the backend
login_res = requests.post('http://127.0.0.1:5001/auth/login', json={"username": "admin", "password": "adminpassword"})
token = None
if login_res.ok:
    token = login_res.json().get('token')
else:
    login_res = requests.post('http://127.0.0.1:5001/auth/login', json={"username": "admin", "password": "admin"})
    token = login_res.json().get('token')

if not token:
    print("Could not get an auth token for admin user.")
    print(login_res.text)
else:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    msg_payload = {"content": "Hello Edgar! This is an automated test from Vibrana AI, testing your GoHighLevel WhatsApp Integration. Phase 15 successfully connected! 🚀"}
    res = requests.post(f"http://127.0.0.1:5001/patients/{patient_id}/whatsapp", json=msg_payload, headers=headers)
    print("Vibrana API Response Status:", res.status_code)
    print("Vibrana API Response Body:", res.text)
