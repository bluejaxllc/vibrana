/**
 * BluejaxBot Telegram Notifier
 * Project: Vibrana (WhatsApp AI)
 */

const AGENT_NAME = 'Vibrana AI';
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3004';
const RELAY_URL = process.env.RELAY_URL || 'https://telegram-bridge-production-d0cb.up.railway.app';
const API_KEY = process.env.BRIDGE_API_KEY || 'ajP5MoK8y3UwkZQzp70TRmI2JGOHEhei';

async function notify(message, options) {
    options = options || {};
    const payload = {
        message, title: options.title || 'Vibrana Update',
        emoji: options.emoji || '💬', priority: options.priority || 'normal',
        source: options.source || AGENT_NAME
    };
    try {
        const res = await fetch(BRIDGE_URL + '/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(3000)
        });
        if (res.ok) return await res.json();
    } catch (e) { }
    try {
        const res = await fetch(RELAY_URL + '/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(5000)
        });
        if (res.ok) return await res.json();
    } catch (e) { }
    return { success: false };
}

if (require.main === module) {
    const msg = process.argv[2] || 'Test from Vibrana AI';
    notify(msg).then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(() => process.exit(1));
}

module.exports = { notify, AGENT_NAME };
