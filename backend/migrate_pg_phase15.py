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
    
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(20)"))
            print("Added phone_number column")
        except Exception as e:
            print(f"phone_number column might already exist: {e}")
            
        try:
            conn.execute(text("ALTER TABLE patients ADD COLUMN opt_in_whatsapp BOOLEAN DEFAULT FALSE"))
            print("Added opt_in_whatsapp column")
        except Exception as e:
            print(f"opt_in_whatsapp column might already exist: {e}")
            
        conn.commit()
    print("Migration finished!")

if __name__ == "__main__":
    run_migration()
