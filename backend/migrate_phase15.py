"""Add missing columns to existing database."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'vibrana.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Check and add missing columns
migrations = [
    ("diagnostic_logs", "snapshot_path", "VARCHAR(255)"),
]

for table, column, col_type in migrations:
    cur.execute(f"PRAGMA table_info({table})")
    existing_cols = [r[1] for r in cur.fetchall()]
    if column not in existing_cols:
        print(f"  Adding {table}.{column} ({col_type})...")
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
    else:
        print(f"  {table}.{column} already exists")

conn.commit()
conn.close()
print("Migration complete!")
