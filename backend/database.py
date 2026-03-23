"""
Vibrana Database Configuration
SQLAlchemy with PostgreSQL (cloud) or SQLite (local dev) support.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Use DATABASE_URL from env (PostgreSQL on Railway/Render) or fall back to local SQLite
DATABASE_URL = os.environ.get('DATABASE_URL', '')

# Render/Railway provides DATABASE_URL with postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

IS_SQLITE = not DATABASE_URL

if IS_SQLITE:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'vibrana.db')}"

# Engine configuration varies by backend
engine_kwargs = {
    'echo': False,
    'pool_pre_ping': True,
}

if IS_SQLITE:
    # SQLite doesn't support pool_recycle; needs check_same_thread=False for Flask threads
    engine_kwargs['connect_args'] = {'check_same_thread': False}
else:
    engine_kwargs['pool_recycle'] = 300

engine = create_engine(DATABASE_URL, **engine_kwargs)
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
    # Import ALL models so Base.metadata knows about every table
    from models import (  # noqa: F401
        Patient, ScanResult, DiagnosticLog, User, AuditLog,
        Team, TeamMember, SystemConfig, ReferenceDocument,
        ApiUsageLog, WorkflowAutomation
    )
    Base.metadata.create_all(bind=engine)
    print(f"[OK] Database initialized ({'SQLite' if IS_SQLITE else 'PostgreSQL'}: {DATABASE_URL[:40]}...)")
