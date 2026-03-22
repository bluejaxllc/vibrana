import os
from sqlalchemy import create_engine, MetaData, inspect

# Use DATABASE_URL from env
pg_url = os.environ.get('DATABASE_URL')
if not pg_url:
    print("Error: DATABASE_URL environment variable is not set.")
    import sys
    sys.exit(1)

if pg_url.startswith('postgres://'):
    pg_url = pg_url.replace('postgres://', 'postgresql://', 1)

sqlite_url = "sqlite:///vibrana.db"

print(f"Connecting to SQLite: {sqlite_url}")
engine_lite = create_engine(sqlite_url)
print(f"Connecting to Output DB: {pg_url[:30]}...")
engine_pg = create_engine(pg_url)

# Reflect existing database
meta_lite = MetaData()
meta_lite.reflect(bind=engine_lite)

meta_pg = MetaData()
meta_pg.reflect(bind=engine_pg)

# Create missing tables in Postgres using our models
from models import Base
Base.metadata.create_all(bind=engine_pg)

# Re-reflect to ensure we have the newly created tables loaded in meta_pg
meta_pg.reflect(bind=engine_pg)

with engine_lite.connect() as conn_lite:
    with engine_pg.begin() as conn_pg:
        # Disable foreign key checks for PostgreSQL during migration if needed, but correct order usually suffices
        # We will insert in the order of metadata sorted_tables to respect foreign keys
        for table in meta_lite.sorted_tables:
            print(f"Migrating table {table.name}...")
            
            # Read from SQLite
            result = conn_lite.execute(table.select())
            rows = result.fetchall()
            
            if rows:
                # Convert rows to dicts
                row_dicts = [dict(zip(result.keys(), row)) for row in rows]
                
                # We should clear existing data if any, or assume it's fresh
                # conn_pg.execute(meta_pg.tables[table.name].delete())
                
                # Insert to PG
                try:
                    conn_pg.execute(meta_pg.tables[table.name].insert(), row_dicts)
                    print(f"  -> Inserted {len(rows)} rows into {table.name}")
                except Exception as e:
                    print(f"  -> Failed to insert into {table.name}: {e}")
            else:
                print(f"  -> No data in {table.name}")

print("Migration completed!")
