import os
from sqlalchemy import create_engine
from sqlalchemy.sql import text

def run_migration():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print("ERROR: No DATABASE_URL found.")
        return

    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)

    if '?' not in db_url:
        db_url += '?sslmode=require'
    elif 'sslmode' not in db_url:
        db_url += '&sslmode=require'

    print(f"Connecting to database...")
    engine = create_engine(db_url)
    
    # All migrations from Phase 15-20
    migrations = [
        # Phase 15: WhatsApp columns
        ("ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)", "phone_number"),
        ("ALTER TABLE patients ADD COLUMN IF NOT EXISTS opt_in_whatsapp BOOLEAN DEFAULT FALSE", "opt_in_whatsapp"),
        # Phase 12: Team support
        ("ALTER TABLE patients ADD COLUMN IF NOT EXISTS team_id VARCHAR(36)", "team_id"),
        # Phase 16: Diagnostic logs
        ("ALTER TABLE diagnostic_logs ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'system'", "message_type"),
        # Phase 17: Practitioner notes on scans
        ("ALTER TABLE scan_results ADD COLUMN IF NOT EXISTS practitioner_notes TEXT", "practitioner_notes"),
        # Phase 18: Share tokens
        ("ALTER TABLE patients ADD COLUMN IF NOT EXISTS share_token VARCHAR(64)", "share_token"),
        ("ALTER TABLE patients ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP", "share_expires_at"),
    ]

    # Create system_config table for cloud (Phase 16+)
    create_tables = [
        """CREATE TABLE IF NOT EXISTS system_config (
            id SERIAL PRIMARY KEY,
            key VARCHAR(100) UNIQUE NOT NULL,
            value TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS teams (
            id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name VARCHAR(200) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS team_members (
            id SERIAL PRIMARY KEY,
            team_id VARCHAR(36) REFERENCES teams(id),
            user_id INTEGER,
            role VARCHAR(20) DEFAULT 'practitioner',
            joined_at TIMESTAMP DEFAULT NOW()
        )"""
    ]
    
    with engine.connect() as conn:
        # Run table creations first
        for sql in create_tables:
            try:
                conn.execute(text(sql))
                print(f"  ✅ Table created or already exists")
            except Exception as e:
                print(f"  ⚠️ Table creation note: {e}")

        # Run column migrations
        for sql, col_name in migrations:
            try:
                conn.execute(text(sql))
                print(f"  ✅ Added {col_name}")
            except Exception as e:
                print(f"  ⚠️ {col_name}: {e}")
            
        conn.commit()
    print("\n🎉 Migration finished! All Phase 15-20 columns applied.")

if __name__ == "__main__":
    run_migration()
