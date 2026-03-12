"""
Vibrana License Module — Hybrid License + Cloud-Gated Paywall System

Tier system:
  - free: Basic scanning, 5 patients max, no AI features
  - pro: Unlimited patients, AI reports, CV tools, macros, plugins
  - clinic: Everything in pro + DICOM/HL7, WhatsApp, team collaboration
"""
import os
import json
import time
import hashlib
import uuid
import platform
import hmac
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, g

# ── Paywall Master Switch ─────────────────────────────────────────
PAYWALL_ENABLED = os.environ.get('VIBRANA_PAYWALL', '').lower() in ('1', 'true', 'yes')

# ── Admin Whitelist (always get clinic tier) ─────────────
ADMIN_WHITELIST = [
    'admin@vibrana.local',
    'dev@vibrana.com',
    'edgar@bluejax.ai',
]

# ── Tier Definitions ──────────────────────────────────────

TIERS = {
    'free': {
        'label': 'Gratis',
        'max_patients': 5,
        'features': [
            'scan_basic',
            'entropy_basic',
            'organ_map',
            'patient_management',
        ]
    },
    'pro': {
        'label': 'Pro',
        'max_patients': -1,  # unlimited
        'features': [
            'scan_basic',
            'scan_advanced',
            'entropy_basic',
            'entropy_full',
            'organ_map',
            'patient_management',
            'ai_interpret',
            'ai_report',
            'ai_anomalies',
            'nls_analyzer',
            'cv_tools',
            'macros',
            'screen_watcher',
            'plugins',
            'export_full',
            'email_reports',
            'live_entropy',
        ]
    },
    'clinic': {
        'label': 'Clínica',
        'max_patients': -1,
        'features': [
            # Everything in pro, plus:
            'scan_basic',
            'scan_advanced',
            'entropy_basic',
            'entropy_full',
            'organ_map',
            'patient_management',
            'ai_interpret',
            'ai_report',
            'ai_anomalies',
            'nls_analyzer',
            'cv_tools',
            'macros',
            'screen_watcher',
            'plugins',
            'export_full',
            'email_reports',
            'live_entropy',
            'export_dicom',
            'export_hl7',
            'whatsapp',
            'teams',
            'batch_analyze',
            'comparison_mode',
        ]
    }
}

# Feature → minimum tier required
FEATURE_TIER_MAP = {
    'scan_basic': 'free',
    'entropy_basic': 'free',
    'organ_map': 'free',
    'patient_management': 'free',
    'scan_advanced': 'pro',
    'entropy_full': 'pro',
    'ai_interpret': 'pro',
    'ai_report': 'pro',
    'ai_anomalies': 'pro',
    'nls_analyzer': 'pro',
    'cv_tools': 'pro',
    'macros': 'pro',
    'screen_watcher': 'pro',
    'plugins': 'pro',
    'export_full': 'pro',
    'email_reports': 'pro',
    'live_entropy': 'pro',
    'export_dicom': 'clinic',
    'export_hl7': 'clinic',
    'whatsapp': 'clinic',
    'teams': 'clinic',
    'batch_analyze': 'clinic',
    'comparison_mode': 'clinic',
}

TIER_ORDER = ['free', 'pro', 'clinic']

# ── License Cache ─────────────────────────────────────────

LICENSE_CACHE_FILE = os.path.join(os.path.dirname(__file__), 'license_cache.json')
LICENSE_SERVER_URL = os.environ.get('VIBRANA_LICENSE_SERVER', 'https://vibrana-license-server-production.up.railway.app')

# In-memory cache: email -> status dict. Loaded from file on startup
_license_state = {}


def get_machine_fingerprint() -> str:
    """Generate a machine-specific fingerprint for license binding."""
    components = [
        platform.node(),           # hostname
        platform.system(),         # OS
        platform.machine(),        # architecture
        str(uuid.getnode()),       # MAC address as int
    ]
    raw = '|'.join(components)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _load_cache():
    """Load license state from cache file."""
    global _license_state
    try:
        if os.path.exists(LICENSE_CACHE_FILE):
            with open(LICENSE_CACHE_FILE, 'r') as f:
                _license_state = json.load(f)
            print("[License] Loaded cached tiers.")
    except Exception as e:
        print(f"[License] Error loading cache: {e}")

def get_current_user_email():
    """Extract the current user's email from the JWT token."""
    from flask import request, g
    from auth import decode_token
    from database import SessionLocal
    from models import User
    
    if hasattr(g, 'current_user_email'):
        return g.current_user_email

    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        payload = decode_token(token)
        if payload:
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.id == payload.get('user_id')).first()
                if user:
                    g.current_user_email = user.email
                    return user.email
            finally:
                db.close()
    return None


def _save_cache():
    """Persist license state to cache file."""
    try:
        with open(LICENSE_CACHE_FILE, 'w') as f:
            json.dump(_license_state, f, indent=2, default=str)
    except Exception as e:
        print(f"[License] Error saving cache: {e}")


def validate_license_remote(email: str) -> dict:
    """
    Validate an account email against the cloud license server.
    """
    import requests

    if not email:
        return {'valid': False, 'error': 'No email provided'}

    # Dev fallback
    if email == 'dev@vibrana.com':
        return {
            'valid': True,
            'tier': 'clinic',
            'email': email,
            'expires_at': (datetime.utcnow() + timedelta(days=365)).isoformat(),
        }

    # Try cloud server
    try:
        resp = requests.post(f"{LICENSE_SERVER_URL}/validate", json={
            'email': email,
            'machine_id': get_machine_fingerprint(),
        }, timeout=10)
        if resp.ok:
            return resp.json()
        else:
            return {'valid': False, 'error': resp.json().get('error', 'Validation failed')}
    except Exception as e:
        print(f"[License] Cloud validation failed (offline?): {e}")
        return {'valid': False, 'error': 'No se pudo contactar al servidor de licencias'}


def fetch_cloud_config():
    """
    Fetch the remote paywall config from the cloud license server.
    This is the kill switch — controls PAYWALL_ENABLED for ALL installations.
    """
    global PAYWALL_ENABLED
    import requests

    try:
        resp = requests.get(f"{LICENSE_SERVER_URL}/config", timeout=10)
        if resp.ok:
            config = resp.json()
            remote_paywall = config.get('paywall_enabled', False)
            PAYWALL_ENABLED = remote_paywall
            print(f"[License] Cloud config: paywall={'ACTIVE' if remote_paywall else 'DISABLED'}")
            return config
    except Exception as e:
        print(f"[License] Cloud config unreachable (using local flag): {e}")
    return None



def get_current_tier() -> str:
    """Get the current license tier for the logged-in user."""
    email = get_current_user_email()
    if not email:
        return 'free'
    
    # Admin whitelist — always clinic tier
    if email.lower() in [e.lower() for e in ADMIN_WHITELIST]:
        return 'clinic'
        
    cached = _license_state.get(email)
    
    # Needs validation if not cached or cached > 24h ago
    needs_validation = True
    if cached and cached.get('last_validated'):
        last_dt = datetime.fromisoformat(cached['last_validated'])
        if datetime.utcnow() - last_dt < timedelta(hours=24):
            needs_validation = False
            
    if needs_validation:
        result = validate_license_remote(email)
        if result.get('valid'):
            _license_state[email] = {
                'tier': result['tier'],
                'email': email,
                'expires_at': result.get('expires_at'),
                'last_validated': datetime.utcnow().isoformat()
            }
            _save_cache()
            return result['tier']
        else:
            # If network error but we have cache, fallback to cache
            if cached and 'No se pudo contactar' in result.get('error', ''):
                return cached.get('tier', 'free')
            return 'free'
            
    return cached.get('tier', 'free')

def activate_license(email: str) -> dict:
    """Force re-validation of a specific email."""
    result = validate_license_remote(email)
    if result.get('valid'):
        _license_state[email] = {
            'tier': result['tier'],
            'email': email,
            'expires_at': result.get('expires_at'),
            'last_validated': datetime.utcnow().isoformat()
        }
        _save_cache()
        return {'success': True, 'tier': result['tier']}
    return {'success': False, 'error': result.get('error', 'Error al validar')}

def deactivate_license() -> dict:
    """Clear cache for current user."""
    email = get_current_user_email()
    if email and email in _license_state:
        del _license_state[email]
        _save_cache()
    return {'success': True, 'tier': 'free'}


def get_license_status() -> dict:
    """Get full license status for frontend consumption."""
    tier = get_current_tier()
    tier_def = TIERS.get(tier, TIERS['free'])
    
    email = get_current_user_email()
    cached = _license_state.get(email, {}) if email else {}

    return {
        'tier': tier,
        'tier_label': tier_def['label'],
        'max_patients': tier_def['max_patients'],
        'features': tier_def['features'],
        'paywall_enabled': PAYWALL_ENABLED,
        'email': email,
        'expires_at': cached.get('expires_at'),
        'machine_id': get_machine_fingerprint()[:8],
        'all_tiers': {
            name: {
                'label': t['label'],
                'max_patients': t['max_patients'],
                'features': t['features'],
            }
            for name, t in TIERS.items()
        },
        'feature_tier_map': FEATURE_TIER_MAP,
    }


def _mask_key(key: str) -> str:
    """Deprecated."""
    pass


def has_feature(feature: str) -> bool:
    """Check if the current license tier includes a feature."""
    if not PAYWALL_ENABLED:
        return True
    tier = get_current_tier()
    tier_def = TIERS.get(tier, TIERS['free'])
    return feature in tier_def['features']


def check_patient_limit(current_count: int) -> bool:
    """Check if adding a patient would exceed the tier limit."""
    if not PAYWALL_ENABLED:
        return True
    tier = get_current_tier()
    tier_def = TIERS.get(tier, TIERS['free'])
    max_patients = tier_def['max_patients']
    if max_patients == -1:
        return True  # unlimited
    return current_count < max_patients


def require_tier(feature: str):
    """
    Decorator to enforce feature-level license gating on Flask routes.
    
    Usage:
        @app.route('/ai/interpret', methods=['POST'])
        @require_tier('ai_interpret')
        def ai_interpret():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not has_feature(feature):
                required_tier = FEATURE_TIER_MAP.get(feature, 'pro')
                tier_label = TIERS.get(required_tier, {}).get('label', required_tier)
                return jsonify({
                    'error': 'upgrade_required',
                    'message': f'Esta función requiere el plan {tier_label}',
                    'feature': feature,
                    'required_tier': required_tier,
                    'current_tier': get_current_tier(),
                }), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


def init_license():
    """Initialize the license system on app startup."""
    _load_cache()

    # Fetch remote config (kill switch) from cloud server
    fetch_cloud_config()

    print(f"[License] System initialized — paywall: {'ACTIVE' if PAYWALL_ENABLED else 'DISABLED'}")

