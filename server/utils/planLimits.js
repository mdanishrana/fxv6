const db = require('../db');

// Hardcoded floor for the FREE tier, which was never seeded as a row in
// subscription_plans (only BASIC/STANDARD/PREMIUM are). Kept as a fallback so
// existing FREE-tier behavior (5 animals) doesn't change just because this
// lookup moved from an inline check to a shared helper.
const FREE_TIER_FALLBACK = { userLimit: 2, cattleLimit: 5 };

// A tier with no matching subscription_plans row and no FREE fallback (e.g. a
// custom/legacy tier value) fails open rather than blocking a paying farm
// because of a data gap - the alternative is silently locking out a customer.
const UNKNOWN_TIER_FALLBACK = { userLimit: null, cattleLimit: null };

function parseLimit(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s || /^unlimited$/i.test(s)) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
}

// Resolves { userLimit, cattleLimit } for a tenant. Both are numbers or null
// (null = unlimited). Most tenants have no tenant_subscriptions row (that
// table is only populated when an admin explicitly creates a billing
// subscription), so the plan lookup is keyed off tenants.tier <->
// subscription_plans.code, with tenant_subscriptions.cattle_limit_override
// applied on top when a subscription row exists and set one.
async function getTenantLimits(tenantId) {
    const tenantRes = await db.query('SELECT tier FROM tenants WHERE id = $1', [tenantId]);
    if (tenantRes.rows.length === 0) return { userLimit: null, cattleLimit: null };
    const tier = tenantRes.rows[0].tier;

    const planRes = await db.query('SELECT user_limit, cattle_limit FROM subscription_plans WHERE code = $1', [tier]);

    let limits;
    if (planRes.rows.length > 0) {
        limits = {
            userLimit: parseLimit(planRes.rows[0].user_limit),
            cattleLimit: parseLimit(planRes.rows[0].cattle_limit)
        };
    } else if (tier === 'FREE') {
        limits = { ...FREE_TIER_FALLBACK };
    } else {
        limits = { ...UNKNOWN_TIER_FALLBACK };
    }

    const overrideRes = await db.query(
        `SELECT cattle_limit_override FROM tenant_subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
    );
    if (overrideRes.rows.length > 0 && overrideRes.rows[0].cattle_limit_override) {
        const overridden = parseLimit(overrideRes.rows[0].cattle_limit_override);
        if (overridden !== null || /^unlimited$/i.test(String(overrideRes.rows[0].cattle_limit_override).trim())) {
            limits.cattleLimit = overridden;
        }
    }

    return limits;
}

module.exports = { getTenantLimits };
