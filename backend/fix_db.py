import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine
from sqlalchemy import text

print("Connected to:", str(engine.url))

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(20)"))
        conn.commit()
        print("phone_number added")
except Exception as e:
    print("phone_number error:", e)

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE patients ADD COLUMN opt_in_whatsapp BOOLEAN DEFAULT FALSE"))
        conn.commit()
        print("opt_in_whatsapp added")
except Exception as e:
    print("opt_in_whatsapp error:", e)
        
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE patients ADD COLUMN team_id VARCHAR(36)"))
        conn.commit()
        print("team_id added")
except Exception as e:
    print("team_id error:", e)

print("Done")
