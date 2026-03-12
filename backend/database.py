"""
Vibrana Database Configuration
SQLAlchemy with PostgreSQL (cloud) or SQLite (local dev) support.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Use DATABASE_URL from env (PostgreSQL on Render) or fall back to local SQLite
DATABASE_URL = os.environ.get('DATABASE_URL', '')

# Render provides DATABASE_URL with postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

if not DATABASE_URL:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'vibrana.db')}"

engine = create_engine(DATABASE_URL, echo=False,
                       pool_pre_ping=True,
                       pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

def get_db():
    """Yield a database session for use in request handlers."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Create all tables."""
    from models import Patient, ScanResult, DiagnosticLog, User, AuditLog  # noqa: F401
    Base.metadata.create_all(bind=engine)
    print(f"[OK] Database initialized ({DATABASE_URL[:30]}...)")
