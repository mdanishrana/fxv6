const crypto = require('crypto');
const db = require('../db');

const TOKEN_VALID_DAYS = 45; // covers a full billing cycle even if the owner is slow to check email

/**
 * Creates a single-use token authorizing the farm owner to act on one animal's
 * current billing status from an email link, without logging in. Same pattern as
 * password-reset / email-verification tokens elsewhere in this app: a random hex
 * string stored server-side with an expiry, consumed exactly once.
 */
async function createPaymentActionToken(tenantId, cattleId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000);
    await db.query(
        `INSERT INTO payment_action_tokens (tenant_id, cattle_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
        [tenantId, cattleId, token, expiresAt]
    );
    return token;
}

/**
 * Validates a token and, if valid and unused, marks it consumed with the chosen
 * action. Returns { ok: true, tenantId, cattleId } or { ok: false, reason }.
 * reason is one of: 'NOT_FOUND', 'EXPIRED', 'ALREADY_USED'.
 */
async function consumeToken(token, action) {
    const result = await db.query(
        `SELECT * FROM payment_action_tokens WHERE token = $1`,
        [token]
    );
    if (result.rows.length === 0) {
        return { ok: false, reason: 'NOT_FOUND' };
    }

    const row = result.rows[0];
    if (row.used_at) {
        return { ok: false, reason: 'ALREADY_USED' };
    }
    if (new Date(row.expires_at) < new Date()) {
        return { ok: false, reason: 'EXPIRED' };
    }

    await db.query(
        `UPDATE payment_action_tokens SET used_at = NOW(), used_action = $1 WHERE id = $2`,
        [action, row.id]
    );

    return { ok: true, tenantId: row.tenant_id, cattleId: row.cattle_id };
}

module.exports = { createPaymentActionToken, consumeToken };
