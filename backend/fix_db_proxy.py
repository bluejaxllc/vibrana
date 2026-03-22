"""Connect directly to Cloud SQL public IP and fix missing columns."""
from sqlalchemy import create_engine, text, inspect

DB_URL = "postgresql://postgres:SuperSecretPassword123!@34.63.125.133:5432/postgres"
engine = create_engine(DB_URL)

insp = inspect(engine)
cols = [c['name'] for c in insp.get_columns('patients')]
print("Current patients columns:", cols)

migrations = [
    ("team_id", "VARCHAR(36)"),
    ("phone_number", "VARCHAR(20)"),
    ("opt_in_whatsapp", "BOOLEAN DEFAULT FALSE"),
]

for col_name, col_type in migrations:
    if col_name not in cols:
        try:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE patients ADD COLUMN {col_name} {col_type}"))
                conn.commit()
                print(f"  [OK] Added {col_name}")
        except Exception as e:
            print(f"  [FAIL] {col_name}: {e}")
    else:
        print(f"  [SKIP] {col_name} already exists")

# Verify
insp2 = inspect(engine)
final_cols = [c['name'] for c in insp2.get_columns('patients')]
print("\nFinal patients columns:", final_cols)
