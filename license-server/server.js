/**
 * Vibrana Cloud License Server
 * 
 * Remote control center for:
 *   - Paywall kill switch (flip on/off for ALL installations)
 *   - License key validation
 *   - Machine fingerprint binding
 *   - Usage analytics
 * 
 * Endpoints:
 *   GET  /config                → Returns paywall_enabled flag (the kill switch)
 *   POST /validate              → Validates license key + machine fingerprint
 *   POST /activate              → Activates a license key for a machine
 *   POST /deactivate            → Deactivates a license key
 *   GET  /admin/licenses        → List all licenses (admin)
 *   POST /admin/licenses        → Create a new license (admin)
 *   POST /admin/toggle-paywall  → Flip the paywall on/off (admin)
 *   GET  /admin/stats           → Usage analytics (admin)
 *   GET  /health                → Health check
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3006;
const ADMIN_KEY = process.env.ADMIN_KEY || 'vibrana-admin-secret-change-me';

app.use(cors());
app.use(express.json());

// ── Database Setup ───────────────────────────────────────

const DB_PATH = process.env.DATABASE_URL || path.join(__dirname, 'licenses.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        license_key TEXT UNIQUE NOT NULL,
        tier TEXT NOT NULL DEFAULT 'pro',
        email TEXT,
        owner_name TEXT,
        machine_id TEXT,
        is_active INTEGER DEFAULT 1,
        activated_at TEXT,
        expires_at TEXT,
        last_validated TEXT,
        validation_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS validation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT,
        machine_id TEXT,
        ip_address TEXT,
        result TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
`);

// Initialize config with defaults
const initConfig = db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`);
initConfig.run('paywall_enabled', 'false');
initConfig.run('free_tier_max_patients', '5');
initConfig.run('announcement', '');

// ── Helpers ──────────────────────────────────────────────

function getConfig(key) {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setConfig(key, value) {
    const existing = db.prepare('SELECT key FROM config WHERE key = ?').get(key);
    if (existing) {
        db.prepare('UPDATE config SET value = ?, updated_at = datetime(?) WHERE key = ?').run(String(value), 'now', key);
    } else {
        db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, String(value));
    }
}

function generateLicenseKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
    }
    return `VIB-${segments.join('-')}`;
}

function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.admin_key;
    if (key !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized — invalid admin key' });
    }
    next();
}

function logValidation(licenseKey, machineId, ip, result) {
    db.prepare(`INSERT INTO validation_log (license_key, machine_id, ip_address, result) VALUES (?, ?, ?, ?)`)
        .run(licenseKey, machineId, ip, result);
}

// ── Public Endpoints ─────────────────────────────────────

/**
 * GET /config — The Kill Switch
 * 
 * Every Vibrana installation calls this on startup and daily.
 * Returns whether paywalls are active across ALL installations.
 */
app.get('/config', (req, res) => {
    const paywallEnabled = getConfig('paywall_enabled') === 'true';
    const freeTierMaxPatients = parseInt(getConfig('free_tier_max_patients') || '5');
    const announcement = getConfig('announcement') || '';

    res.json({
        paywall_enabled: paywallEnabled,
        free_tier_max_patients: freeTierMaxPatients,
        announcement: announcement,
        server_time: new Date().toISOString(),
    });
});

/**
 * POST /validate — Validate a license key
 * Called by Vibrana backend on startup and periodically.
 */
app.post('/validate', (req, res) => {
    const { license_key, machine_id } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!license_key) {
        logValidation(null, machine_id, ip, 'missing_key');
        return res.status(400).json({ valid: false, error: 'License key required' });
    }

    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(license_key);

    if (!license) {
        logValidation(license_key, machine_id, ip, 'not_found');
        return res.json({ valid: false, error: 'Clave de licencia no encontrada' });
    }

    if (!license.is_active) {
        logValidation(license_key, machine_id, ip, 'inactive');
        return res.json({ valid: false, error: 'Licencia desactivada' });
    }

    // Check expiration
    if (license.expires_at) {
        const expires = new Date(license.expires_at);
        if (expires < new Date()) {
            logValidation(license_key, machine_id, ip, 'expired');
            return res.json({ valid: false, error: 'Licencia expirada' });
        }
    }

    // Check machine binding (if already bound)
    if (license.machine_id && machine_id && license.machine_id !== machine_id) {
        logValidation(license_key, machine_id, ip, 'machine_mismatch');
        return res.json({ 
            valid: false, 
            error: 'Esta licencia está vinculada a otra máquina' 
        });
    }

    // Bind machine on first validation if not yet bound
    if (!license.machine_id && machine_id) {
        db.prepare('UPDATE licenses SET machine_id = ? WHERE id = ?').run(machine_id, license.id);
    }

    // Update validation stats
    db.prepare(`UPDATE licenses SET last_validated = datetime('now'), validation_count = validation_count + 1 WHERE id = ?`)
        .run(license.id);

    logValidation(license_key, machine_id, ip, 'valid');

    res.json({
        valid: true,
        tier: license.tier,
        email: license.email,
        expires_at: license.expires_at,
        owner_name: license.owner_name,
    });
});

/**
 * POST /activate — Activate a license key for a machine
 */
app.post('/activate', (req, res) => {
    const { license_key, machine_id } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!license_key) {
        return res.status(400).json({ success: false, error: 'License key required' });
    }

    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(license_key);

    if (!license) {
        logValidation(license_key, machine_id, ip, 'activate_not_found');
        return res.json({ success: false, error: 'Clave de licencia no encontrada' });
    }

    if (!license.is_active) {
        return res.json({ success: false, error: 'Licencia desactivada' });
    }

    // Bind to machine
    db.prepare(`UPDATE licenses SET machine_id = ?, activated_at = datetime('now'), last_validated = datetime('now') WHERE id = ?`)
        .run(machine_id || null, license.id);

    logValidation(license_key, machine_id, ip, 'activated');

    res.json({
        success: true,
        tier: license.tier,
        email: license.email,
        expires_at: license.expires_at,
    });
});

/**
 * POST /deactivate — Release a license key from a machine
 */
app.post('/deactivate', (req, res) => {
    const { license_key, machine_id } = req.body || {};

    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(license_key);
    if (!license) {
        return res.json({ success: false, error: 'Clave no encontrada' });
    }

    db.prepare('UPDATE licenses SET machine_id = NULL WHERE id = ?').run(license.id);
    res.json({ success: true });
});

// ── Health Check ─────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'vibrana-license-server', version: '1.0.0' });
});

// ── Admin Endpoints ──────────────────────────────────────

/**
 * POST /admin/toggle-paywall — THE KILL SWITCH
 * Flip this to enable/disable paywalls across ALL installations.
 */
app.post('/admin/toggle-paywall', requireAdmin, (req, res) => {
    const { enabled } = req.body;
    const newValue = enabled === true || enabled === 'true';
    setConfig('paywall_enabled', newValue.toString());

    console.log(`[ADMIN] Paywall ${newValue ? 'ENABLED' : 'DISABLED'} at ${new Date().toISOString()}`);

    res.json({
        success: true,
        paywall_enabled: newValue,
        message: newValue 
            ? '🔒 Paywall ACTIVADO — todas las instalaciones verán restricciones en su próximo check-in'
            : '🔓 Paywall DESACTIVADO — todo gratis para todos',
    });
});

/**
 * POST /admin/set-config — Set any config value
 */
app.post('/admin/set-config', requireAdmin, (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    setConfig(key, value);
    res.json({ success: true, key, value: String(value) });
});

/**
 * GET /admin/licenses — List all licenses
 */
app.get('/admin/licenses', requireAdmin, (req, res) => {
    const licenses = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
    res.json(licenses);
});

/**
 * POST /admin/licenses — Create a new license
 */
app.post('/admin/licenses', requireAdmin, (req, res) => {
    const { tier = 'pro', email, owner_name, expires_days, notes } = req.body;

    const id = uuidv4();
    const licenseKey = generateLicenseKey();
    const expiresAt = expires_days 
        ? new Date(Date.now() + expires_days * 86400000).toISOString() 
        : null;

    db.prepare(`INSERT INTO licenses (id, license_key, tier, email, owner_name, expires_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, licenseKey, tier, email || null, owner_name || null, expiresAt, notes || null);

    const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);

    console.log(`[ADMIN] Created license: ${licenseKey} (${tier}) for ${email || 'unassigned'}`);

    res.json({ success: true, license });
});

/**
 * DELETE /admin/licenses/:id — Revoke a license
 */
app.delete('/admin/licenses/:id', requireAdmin, (req, res) => {
    db.prepare('UPDATE licenses SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'License revoked' });
});

/**
 * POST /admin/licenses/:id/unbind — Unbind machine from license
 */
app.post('/admin/licenses/:id/unbind', requireAdmin, (req, res) => {
    db.prepare('UPDATE licenses SET machine_id = NULL WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Machine unbound' });
});

/**
 * GET /admin/stats — Usage analytics
 */
app.get('/admin/stats', requireAdmin, (req, res) => {
    const totalLicenses = db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
    const activeLicenses = db.prepare('SELECT COUNT(*) as count FROM licenses WHERE is_active = 1').get().count;
    const boundLicenses = db.prepare('SELECT COUNT(*) as count FROM licenses WHERE machine_id IS NOT NULL').get().count;
    const validationsToday = db.prepare(`SELECT COUNT(*) as count FROM validation_log WHERE created_at >= date('now')`).get().count;
    const validationsWeek = db.prepare(`SELECT COUNT(*) as count FROM validation_log WHERE created_at >= date('now', '-7 days')`).get().count;

    const recentValidations = db.prepare(`SELECT * FROM validation_log ORDER BY created_at DESC LIMIT 20`).all();

    const tierBreakdown = db.prepare(`SELECT tier, COUNT(*) as count FROM licenses WHERE is_active = 1 GROUP BY tier`).all();

    res.json({
        paywall_enabled: getConfig('paywall_enabled') === 'true',
        total_licenses: totalLicenses,
        active_licenses: activeLicenses,
        bound_to_machines: boundLicenses,
        validations_today: validationsToday,
        validations_this_week: validationsWeek,
        tier_breakdown: tierBreakdown,
        recent_validations: recentValidations,
    });
});

// ── Start Server ─────────────────────────────────────────

app.listen(PORT, () => {
    const paywallStatus = getConfig('paywall_enabled') === 'true' ? 'ACTIVE' : 'DISABLED';
    const licenseCount = db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
    
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Vibrana License Server — v1.0.0             ║`);
    console.log(`║  Port: ${PORT}                                 ║`);
    console.log(`║  Paywall: ${paywallStatus.padEnd(34)}║`);
    console.log(`║  Licenses: ${String(licenseCount).padEnd(33)}║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
});
