"""
Vibrana Data Models — SQLAlchemy ORM
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = 'users'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), default='')
    role = Column(String(20), default='practitioner')  # admin, practitioner, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "teams": [link.to_dict() for link in self.team_links] if hasattr(self, 'team_links') else []
        }


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('users.id'), nullable=True)
    action = Column(String(50), nullable=False)  # login, create_patient, delete_scan, etc.
    entity_type = Column(String(50), nullable=True)  # patient, scan, user
    entity_id = Column(String(36), nullable=True)
    details = Column(JSON, default=dict)
    ip_address = Column(String(45), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship('User', backref='audit_logs')

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "details": self.details or {},
            "ip_address": self.ip_address,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "username": self.user.username if self.user else None,
        }


# ──────────────────────────────────────
# TEAMS — Phase 12
# ──────────────────────────────────────
class Team(Base):
    __tablename__ = 'teams'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = relationship('TeamMember', back_populates='team', cascade='all, delete-orphan')
    patients = relationship('Patient', back_populates='team')

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "member_count": len(self.members) if self.members else 0
        }


class TeamMember(Base):
    __tablename__ = 'team_members'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey('teams.id'), nullable=False)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    role = Column(String(20), default='practitioner')  # owner, practitioner, viewer
    joined_at = Column(DateTime, default=datetime.utcnow)

    team = relationship('Team', back_populates='members')
    user = relationship('User', backref='team_links')

    def to_dict(self):
        return {
            "id": self.id,
            "team_id": self.team_id,
            "user_id": self.user_id,
            "role": self.role,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "team_name": self.team.name if self.team else None,
            "username": self.user.username if self.user else None
        }


class Patient(Base):
    __tablename__ = 'patients'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String(10), nullable=False)
    notes = Column(Text, default='')
    phone_number = Column(String(20), nullable=True) # Phase 15
    opt_in_whatsapp = Column(Boolean, default=False) # Phase 15
    team_id = Column(String(36), ForeignKey('teams.id'), nullable=True) # Linking to Team (Phase 12)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    scans = relationship('ScanResult', back_populates='patient', cascade='all, delete-orphan',
                         order_by='ScanResult.timestamp.desc()')
    team = relationship('Team', back_populates='patients')
    messages = relationship('MessageLog', back_populates='patient', cascade='all, delete-orphan',
                             order_by='MessageLog.timestamp.desc()')

    def to_dict(self, include_scans=False):
        data = {
            "id": self.id,
            "name": self.name,
            "age": self.age,
            "gender": self.gender,
            "notes": self.notes or '',
            "phone_number": self.phone_number or '', # Phase 15
            "opt_in_whatsapp": self.opt_in_whatsapp, # Phase 15
            "team_id": self.team_id, # (Phase 12)
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "scan_count": len(self.scans) if self.scans else 0,
        }
        if include_scans:
            data["scans"] = [s.to_dict() for s in self.scans]
        return data


class MessageLog(Base):
    """Logs messages sent to a patient via WhatsApp/SMS."""
    __tablename__ = 'message_logs'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey('patients.id'), nullable=False)
    team_id = Column(String(36), ForeignKey('teams.id'), nullable=True)
    sender_id = Column(String(36), ForeignKey('users.id'), nullable=True)
    message_type = Column(String(50), default='whatsapp') # whatsapp, sms, email
    content = Column(Text, nullable=False)
    status = Column(String(50), default='sent') # sent, delivered, failed
    timestamp = Column(DateTime, default=datetime.utcnow)

    patient = relationship('Patient', back_populates='messages')
    team = relationship('Team', backref='messages')

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "team_id": self.team_id,
            "sender_id": self.sender_id,
            "message_type": self.message_type,
            "content": self.content,
            "status": self.status,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }

class ScanResult(Base):
    __tablename__ = 'scan_results'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey('patients.id'), nullable=False)
    organ_name = Column(String(100), default='Unknown Organ')
    timestamp = Column(DateTime, default=datetime.utcnow)
    entropy_points = Column(JSON, default=list)  # List of dicts: {'level': 6, 'x': 100, 'y': 200}
    counts = Column(JSON, default=dict)  # {1: 0, 2: 0, ..., 6: 0}
    total_points = Column(Integer, default=0)
    status = Column(String(100), default='Normal')
    practitioner_notes = Column(Text, default='')

    patient = relationship('Patient', back_populates='scans')

    def calculate_summary(self):
        """Calculate status and counts from entropy_points."""
        counts = {str(i): 0 for i in range(1, 7)}
        if self.entropy_points:
            for p in self.entropy_points:
                level = str(p.get('level', 1))
                counts[level] = counts.get(level, 0) + 1

        status = "Normal"
        c6 = counts.get('6', 0)
        c5 = counts.get('5', 0)
        c4 = counts.get('4', 0)
        if c6 > 0:
            status = "Pathology Detected (Level 6)"
        elif c5 > 2:
            status = "Compromised (Level 5)"
        elif c4 > 5:
            status = "Stressed (Level 4)"

        self.counts = counts
        self.total_points = sum(counts.values())
        self.status = status
        return {"status": status, "counts": counts, "total_points": self.total_points}

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "organ_name": self.organ_name,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "entropy_points": self.entropy_points or [],
            "counts": self.counts or {},
            "total_points": self.total_points or 0,
            "status": self.status or 'Normal',
            "practitioner_notes": self.practitioner_notes or '',
        }


class DiagnosticLog(Base):
    """Auto-logged entry for every screen change detected by the watcher."""
    __tablename__ = 'diagnostic_logs'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    patient_id = Column(String(36), ForeignKey('patients.id'), nullable=True)

    # Detection info
    event_type = Column(String(30), default='screen_change')   # screen_change, manual_scan, batch
    change_pct = Column(Float, default=0.0)
    organ_detected = Column(String(100), default='Unknown')

    # OCR data
    ocr_text = Column(Text, default='')
    header_text = Column(String(255), default='')
    status_bar = Column(String(255), default='')
    summary_text = Column(String(500), default='')

    # Structured NLS readings (JSON)
    nls_readings = Column(JSON, default=dict)       # {rows, row_count, reserve_pct, keywords, frequencies}
    nls_window_found = Column(Boolean, default=False)

    # Entropy analysis (JSON)
    entropy_analysis = Column(JSON, default=dict)    # {total_points, counts, status, organ_name}

    # Severity classification
    severity = Column(String(20), default='normal')  # normal, attention, warning, critical
    
    # Snapshot path (Phase 11)
    snapshot_path = Column(String(255), nullable=True)

    patient = relationship('Patient', backref='diagnostic_logs')

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "patient_id": self.patient_id,
            "event_type": self.event_type,
            "change_pct": self.change_pct,
            "organ_detected": self.organ_detected,
            "ocr_text": self.ocr_text or '',
            "header_text": self.header_text or '',
            "status_bar": self.status_bar or '',
            "summary_text": self.summary_text or '',
            "nls_readings": self.nls_readings or {},
            "nls_window_found": self.nls_window_found,
            "entropy_analysis": self.entropy_analysis or {},
            "severity": self.severity or 'normal',
            "snapshot_path": self.snapshot_path,
        }


class ApiUsageLog(Base):
    """Tracks daily API calls to external services like Gemini to enforce quotas."""
    __tablename__ = 'api_usage_logs'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    service = Column(String(100), nullable=False) # e.g., 'gemini-flash'
    tokens_used = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "service": self.service,
            "tokens_used": self.tokens_used,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class SystemConfig(Base):
    """Global system configuration (SMTP, Simulation Mode, etc.)"""
    __tablename__ = 'system_configs'

    key = Column(String(100), primary_key=True)
    value = Column(String(500), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "key": self.key,
            "value": self.value,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class WorkflowAutomation(Base):
    """Stores automated clinical sequences (e.g. Full Body Scan)."""
    __tablename__ = 'workflow_automations'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(Text, default='')
    team_id = Column(String(36), ForeignKey('teams.id'), nullable=True)
    
    # JSON list of commands: [{"command": "START_SCAN", "params": {"organ": "Heart"}}, ...]
    sequence = Column(JSON, default=list)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    team = relationship('Team', backref='automations')

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "team_id": self.team_id,
            "sequence": self.sequence or [],
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

# ──────────────────────────────────────
# KNOWLEDGE BASE — Phase 16
# ──────────────────────────────────────
class ReferenceDocument(Base):
    """Stores uploaded reference PDFs for AI context injection."""
    __tablename__ = 'reference_documents'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False)
    extracted_text = Column(Text, nullable=False)
    uploaded_by = Column(String(36), ForeignKey('users.id'), nullable=True) # Optional linking to user
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "uploaded_by": self.uploaded_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            # We omit extracted_text from the basic dict to avoid massive payload sizes
            "size_chars": len(self.extracted_text) if self.extracted_text else 0
        }
