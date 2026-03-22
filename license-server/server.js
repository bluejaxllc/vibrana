/**
 * Vibrana Cloud License Server
 * 
 * Remote control center for:
 *   - Paywall kill switch (flip on/off for ALL installations)
 *   - License key validation
 *   - Machine fingerprint binding
 *   - Usage analytics
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3006;
const ADMIN_KEY = process.env.ADMIN_KEY || 'vibrana-admin-secret-change-me';

app.use(cors());
app.use(express.json());

// ── Database Setup ───────────────────────────────────────

const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:dummy@localhost:5432/dummy';
const pool = new Pool({ connectionString: DB_URL });

async function initDB() {
    await pool.query(`
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
    `);

    // Initialize config with defaults
    const initConfig = async (key, value) => {
        await pool.query('INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    };
    
    await initConfig('paywall_enabled', 'false');
    await initConfig('free_tier_max_patients', '5');
    await initConfig('announcement', '');
    console.log('[OK] Database connected and synced.');
}

// ── Helpers ──────────────────────────────────────────────

async function getConfig(key) {
    const res = await pool.query('SELECT value FROM config WHERE key = $1', [key]);
    return res.rows.length ? res.rows[0].value : null;
}

async function setConfig(key, value) {
    await pool.query(
        'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
        [key, String(value)]
    );
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

async function logValidation(licenseKey, machineId, ip, result) {
    try {
        await pool.query(
            `INSERT INTO validation_log (license_key, machine_id, ip_address, result) VALUES ($1, $2, $3, $4)`,
            [licenseKey, machineId, ip, result]
        );
    } catch (e) {
        console.error('Failed to log validation:', e);
    }
}

// ── Public Endpoints ─────────────────────────────────────

app.get('/config', async (req, res) => {
    try {
        const paywallEnabled = await getConfig('paywall_enabled') === 'true';
        const freeTierMaxPatients = parseInt(await getConfig('free_tier_max_patients') || '5');
        const announcement = await getConfig('announcement') || '';

        res.json({
            paywall_enabled: paywallEnabled,
            free_tier_max_patients: freeTierMaxPatients,
            announcement: announcement,
            server_time: new Date().toISOString(),
        });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/validate', async (req, res) => {
    try {
        const { email, machine_id } = req.body || {};
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        if (!email) {
            await logValidation(null, machine_id, ip, 'missing_email');
            return res.status(400).json({ valid: false, error: 'Email required' });
        }

        const lRes = await pool.query('SELECT * FROM licenses WHERE email = $1', [email]);
        const license = lRes.rows[0];

        if (!license) {
            await logValidation('email:'+email, machine_id, ip, 'not_found');
            return res.json({ valid: false, error: 'Suscripción no encontrada para este correo' });
        }

        if (!license.is_active) {
            await logValidation('email:'+email, machine_id, ip, 'inactive');
            return res.json({ valid: false, error: 'Suscripción desactivada' });
        }

        if (license.expires_at) {
            const expires = new Date(license.expires_at);
            if (expires < new Date()) {
                await logValidation('email:'+email, machine_id, ip, 'expired');
                return res.json({ valid: false, error: 'Suscripción expirada' });
            }
        }

        if (machine_id && license.machine_id !== machine_id) {
            await pool.query('UPDATE licenses SET machine_id = $1 WHERE id = $2', [machine_id, license.id]);
            await logValidation('email:'+email, machine_id, ip, 'machine_roamed');
        }

        await pool.query(
            `UPDATE licenses SET last_validated = CURRENT_TIMESTAMP, validation_count = validation_count + 1 WHERE id = $1`,
            [license.id]
        );

        await logValidation('email:'+email, machine_id, ip, 'valid');

        res.json({
            valid: true,
            tier: license.tier,
            email: license.email,
            expires_at: license.expires_at,
            owner_name: license.owner_name,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/activate', async (req, res) => {
    try {
        const { email, machine_id } = req.body || {};
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email required' });
        }

        const lRes = await pool.query('SELECT * FROM licenses WHERE email = $1', [email]);
        const license = lRes.rows[0];

        if (!license) {
            await logValidation('email:'+email, machine_id, ip, 'activate_not_found');
            return res.json({ success: false, error: 'Suscripción no encontrada' });
        }

        if (!license.is_active) {
            return res.json({ success: false, error: 'Suscripción desactivada' });
        }

        await pool.query(
            `UPDATE licenses SET machine_id = $1, activated_at = CURRENT_TIMESTAMP, last_validated = CURRENT_TIMESTAMP WHERE id = $2`,
            [machine_id || null, license.id]
        );

        await logValidation('email:'+email, machine_id, ip, 'activated');

        res.json({
            success: true,
            tier: license.tier,
            email: license.email,
            expires_at: license.expires_at,
        });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/deactivate', async (req, res) => {
    try {
        const { email, machine_id } = req.body || {};
        const lRes = await pool.query('SELECT * FROM licenses WHERE email = $1', [email]);
        const license = lRes.rows[0];

        if (!license) {
            return res.json({ success: false, error: 'Suscripción no encontrada' });
        }

        await pool.query('UPDATE licenses SET machine_id = NULL WHERE id = $1', [license.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'vibrana-license-server', version: '1.0.0-pg' });
});

// ── Admin Endpoints ──────────────────────────────────────

app.post('/admin/toggle-paywall', requireAdmin, async (req, res) => {
    try {
        const { enabled } = req.body;
        const newValue = enabled === true || enabled === 'true';
        await setConfig('paywall_enabled', newValue.toString());

        console.log(`[ADMIN] Paywall ${newValue ? 'ENABLED' : 'DISABLED'} at ${new Date().toISOString()}`);

        res.json({
            success: true,
            paywall_enabled: newValue,
            message: newValue 
                ? '🔒 Paywall ACTIVADO'
                : '🔓 Paywall DESACTIVADO',
        });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/admin/set-config', requireAdmin, async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'key required' });
        await setConfig(key, value);
        res.json({ success: true, key, value: String(value) });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/admin/licenses', requireAdmin, async (req, res) => {
    try {
        const lRes = await pool.query('SELECT * FROM licenses ORDER BY created_at DESC');
        res.json(lRes.rows);
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/admin/licenses', requireAdmin, async (req, res) => {
    try {
        const { tier = 'pro', email, owner_name, expires_days, notes } = req.body;

        const id = uuidv4();
        const licenseKey = generateLicenseKey();
        let expiresAt = null;
        if (expires_days) {
            const d = new Date();
            d.setDate(d.getDate() + expires_days);
            expiresAt = d.toISOString();
        }

        await pool.query(
            `INSERT INTO licenses (id, license_key, tier, email, owner_name, expires_at, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, licenseKey, tier, email || null, owner_name || null, expiresAt, notes || null]
        );

        const lRes = await pool.query('SELECT * FROM licenses WHERE id = $1', [id]);
        res.json({ success: true, license: lRes.rows[0] });
    } catch (e) {
        res.status(500).json({ error: 'Database error', details: String(e) });
    }
});

app.delete('/admin/licenses/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE licenses SET is_active = 0 WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'License revoked' });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/admin/licenses/:id/unbind', requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE licenses SET machine_id = NULL WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Machine unbound' });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/admin/stats', requireAdmin, async (req, res) => {
    try {
        const c1 = await pool.query('SELECT COUNT(*) as count FROM licenses');
        const c2 = await pool.query('SELECT COUNT(*) as count FROM licenses WHERE is_active = 1');
        const c3 = await pool.query('SELECT COUNT(*) as count FROM licenses WHERE machine_id IS NOT NULL');
        const c4 = await pool.query(`SELECT COUNT(*) as count FROM validation_log WHERE created_at >= CURRENT_DATE`);
        const c5 = await pool.query(`SELECT COUNT(*) as count FROM validation_log WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`);
        const rv = await pool.query(`SELECT * FROM validation_log ORDER BY created_at DESC LIMIT 20`);
        const tb = await pool.query(`SELECT tier, COUNT(*) as count FROM licenses WHERE is_active = 1 GROUP BY tier`);

        res.json({
            paywall_enabled: await getConfig('paywall_enabled') === 'true',
            total_licenses: parseInt(c1.rows[0].count),
            active_licenses: parseInt(c2.rows[0].count),
            bound_to_machines: parseInt(c3.rows[0].count),
            validations_today: parseInt(c4.rows[0].count),
            validations_this_week: parseInt(c5.rows[0].count),
            tier_breakdown: tb.rows,
            recent_validations: rv.rows,
        });
    } catch (e) {
        res.status(500).json({ error: 'Database error', details: String(e) });
    }
});

// ── Start Server ─────────────────────────────────────────

initDB().then(() => {
    app.listen(PORT, async () => {
        const paywallEnabled = await getConfig('paywall_enabled') === 'true';
        const paywallStatus = paywallEnabled ? 'ACTIVE' : 'DISABLED';
        const licenseCountRes = await pool.query('SELECT COUNT(*) as count FROM licenses');
        const licenseCount = licenseCountRes.rows[0].count;
        
        console.log(`\n╔══════════════════════════════════════════════╗`);
        console.log(`║  Vibrana License Server — v1.0.0-pg          ║`);
        console.log(`║  Port: ${PORT}                                 ║`);
        console.log(`║  Paywall: ${paywallStatus.padEnd(34)}║`);
        console.log(`║  Licenses: ${String(licenseCount).padEnd(33)}║`);
        console.log(`╚══════════════════════════════════════════════╝\n`);
    });
}).catch(console.error);
