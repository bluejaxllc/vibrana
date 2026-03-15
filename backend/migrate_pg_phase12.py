import os
import sys

# Provide a fallback fallback URI or use the environment one 
# Ensure it starts with postgresql:// and not postgres:// for SQLAlchemy 
database_url = os.environ.get('DATABASE_URL', '')
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

if not database_url:
    print("Error: DATABASE_URL environment variable is not set.")
    sys.exit(1)

from sqlalchemy import create_engine
engine = create_engine(database_url)

try:
    with engine.begin() as conn:
        print("Adding team_id to patients table...")
        conn.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS team_id VARCHAR(36) REFERENCES teams(id)")
        print("Done.")
except Exception as e:
    print(f"Error during migration: {e}")
    sys.exit(1)
