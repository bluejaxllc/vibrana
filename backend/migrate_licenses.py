import os
import sqlite3
import psycopg2
from psycopg2.extras import DictCursor
import urllib.parse

pg_url = os.environ.get('DATABASE_URL')
# Parse the URI properly to remove sqlalchemy specific stuff and support psycopg2 connection strings
# Or we can just use psycopg2.connect() which understands "postgresql://..." natively and also "postgres://..." natively!

sqlite_path = r"..\license-server\licenses.db"
print("Connecting SQLite at", sqlite_path)
lite_conn = sqlite3.connect(sqlite_path)
lite_conn.row_factory = sqlite3.Row

print("Connecting PG at", pg_url[:30])
pg_conn = psycopg2.connect(pg_url)
pg_cur = pg_conn.cursor()

# 1. Create tables exactly like server.js
pg_cur.execute("""
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS licenses (
            id TEXT PRIMARY KEY,
            license_key TEXT UNIQUE NOT NULL,
            tier TEXT NOT NULL DEFAULT 'pro',
            email TEXT,
            owner_name TEXT,
            machine_id TEXT,
            is_active INTEGER DEFAULT 1,
            activated_at TIMESTAMP,
            expires_at TIMESTAMP,
            last_validated TIMESTAMP,
            validation_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        );
        CREATE TABLE IF NOT EXISTS validation_log (
            id SERIAL PRIMARY KEY,
            license_key TEXT,
            machine_id TEXT,
            ip_address TEXT,
            result TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
""")
pg_conn.commit()

def migrate_table(table_name):
    print(f"Migrating {table_name}...")
    lit_cur = lite_conn.cursor()
    lit_cur.execute(f"SELECT * FROM {table_name}")
    rows = lit_cur.fetchall()
    if not rows:
        print(" -> No data")
        return
    
    cols = rows[0].keys()
    col_str = ", ".join(cols)
    val_str = ", ".join(["%s"] * len(cols))
    
    insert_sql = f"INSERT INTO {table_name} ({col_str}) VALUES ({val_str}) ON CONFLICT DO NOTHING;"
    for row in rows:
        try:
            pg_cur.execute(insert_sql, tuple(row))
        except Exception as e:
            print(f"Failed row: {e}")
            pg_conn.rollback()
            continue
    pg_conn.commit()
    print(f" -> Inserted up to {len(rows)} rows")

migrate_table('config')
migrate_table('licenses')
migrate_table('validation_log')

print("Migration done!")
