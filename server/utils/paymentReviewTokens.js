const crypto = require('crypto');
const db = require('../db');

const TOKEN_VALID_DAYS = 45; // covers a full billing cycle even if the owner checks the bank in batches

/**
 * Creates a tenant-scoped token authorizing access to the bulk "review this cycle's
 * payments" checklist page from the monthly billing email, without logging in.
 * Unlike the single-use payment_action_tokens, this token is NOT consumed on use -
 * the farm owner may return to the same link multiple times over the cycle as
 * payments come in from different animal owners on different days.
 */
async function createReviewToken(tenantId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000);
    await db.query(
        `INSERT INTO payment_review_tokens (tenant_id, token, expires_at) VALUES ($1, $2, $3)`,
        [tenantId, token, expiresAt]
    );
    return token;
}

/**
 * Validates a review token. Returns { ok: true, tenantId } or { ok: false, reason }.
 * reason is one of: 'NOT_FOUND', 'EXPIRED'.
 */
async function validateReviewToken(token) {
    const result = await db.query(`SELECT * FROM payment_review_tokens WHERE token = $1`, [token]);
    if (result.rows.length === 0) {
        return { ok: false, reason: 'NOT_FOUND' };
    }
    const row = result.rows[0];
    if (new Date(row.expires_at) < new Date()) {
        return { ok: false, reason: 'EXPIRED' };
    }
    return { ok: true, tenantId: row.tenant_id };
}

module.exports = { createReviewToken, validateReviewToken };
