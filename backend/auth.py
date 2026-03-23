"""
Authentication module — JWT-based auth with bcrypt password hashing.
"""
import os
import jwt
import bcrypt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, g
from database import SessionLocal
from models import User

SECRET_KEY = os.environ.get('JWT_SECRET', 'vibrana-overseer-secret-key-change-in-production')
TOKEN_EXPIRY_HOURS = 24


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def generate_token(user_id: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'role': role,
        'exp': datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def generate_share_token(patient_id: str) -> str:
    """Generate a token specifically for publicly sharing a patient report, valid for 30 days."""
    payload = {
        'patient_id': patient_id,
        'type': 'share_report',
        'exp': datetime.utcnow() + timedelta(days=30),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')


def decode_share_token(token: str) -> str:
    """Decode a share token and return the patient_id if valid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        if payload.get('type') == 'share_report':
            return payload.get('patient_id')
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        pass
    return None


def require_auth(f):
    """Decorator to require JWT authentication on a route."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]

        if not token:
            return jsonify({'error': 'Authentication required'}), 401

        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401

        # Attach user to request context
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == payload['user_id']).first()
            if not user or not user.is_active:
                return jsonify({'error': 'User not found or inactive'}), 401
            g.current_user = user
            g.current_user_dict = user.to_dict()
            request.user_id = user.id
        finally:
            db.close()

        return f(*args, **kwargs)
    return decorated


def require_role(role):
    """Decorator to require a specific role."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, 'current_user') or g.current_user.role != role:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
