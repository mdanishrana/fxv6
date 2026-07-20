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
// subscription_plans.code, with tenants.cattle_limit_override /
// user_limit_override applied on top - a per-tenant capacity grant an admin
// can set independent of plan/subscription (the "increase capacity without
// changing plan" admin action). tenant_subscriptions.cattle_limit_override is
// an earlier, unused column for the same idea; overrides now live on tenants
// so they work even for the 5 of 7 tenants with no subscription row at all.
async function getTenantLimits(tenantId) {
    const tenantRes = await db.query(
        'SELECT tier, cattle_limit_override, user_limit_override FROM tenants WHERE id = $1',
        [tenantId]
    );
    if (tenantRes.rows.length === 0) return { userLimit: null, cattleLimit: null };
    const tenant = tenantRes.rows[0];

    const planRes = await db.query('SELECT user_limit, cattle_limit FROM subscription_plans WHERE code = $1', [tenant.tier]);

    let limits;
    if (planRes.rows.length > 0) {
        limits = {
            userLimit: parseLimit(planRes.rows[0].user_limit),
            cattleLimit: parseLimit(planRes.rows[0].cattle_limit)
        };
    } else if (tenant.tier === 'FREE') {
        limits = { ...FREE_TIER_FALLBACK };
    } else {
        limits = { ...UNKNOWN_TIER_FALLBACK };
    }

    if (tenant.cattle_limit_override !== null && tenant.cattle_limit_override !== undefined) {
        limits.cattleLimit = parseLimit(tenant.cattle_limit_override);
    }
    if (tenant.user_limit_override !== null && tenant.user_limit_override !== undefined) {
        limits.userLimit = tenant.user_limit_override;
    }

    return limits;
}

// Current cattle/user counts for a tenant, alongside its resolved limits and
// utilization percentages (null when the corresponding limit is unlimited).
async function getTenantUsage(tenantId) {
    const limits = await getTenantLimits(tenantId);
    const cattleRes = await db.query('SELECT COUNT(*) FROM cattle WHERE tenant_id = $1', [tenantId]);
    const userRes = await db.query(`SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role != 'ANIMAL_OWNER'`, [tenantId]);
    const cattleCount = parseInt(cattleRes.rows[0].count);
    const userCount = parseInt(userRes.rows[0].count);

    return {
        cattleCount,
        userCount,
        cattleLimit: limits.cattleLimit,
        userLimit: limits.userLimit,
        cattleUtilizationPct: limits.cattleLimit ? Math.round((cattleCount / limits.cattleLimit) * 100) : null,
        userUtilizationPct: limits.userLimit ? Math.round((userCount / limits.userLimit) * 100) : null
    };
}

// Rough forecast of days until a tenant's cattle count reaches its limit, based
// on how many animals it added in the last 30 days. Deliberately simple (linear
// projection from a 30-day window) rather than a real trend model - good enough
// to flag "this farm will hit its cap soon" without a dedicated analytics stack.
// Returns null when there's no limit, no room left (already at/over), or too
// little recent growth to project from.
async function forecastDaysToLimit(tenantId, cattleCount, cattleLimit) {
    if (!cattleLimit || cattleCount >= cattleLimit) return null;

    const recentRes = await db.query(
        `SELECT COUNT(*) FROM cattle WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        [tenantId]
    );
    const addedLast30Days = parseInt(recentRes.rows[0].count);
    if (addedLast30Days <= 0) return null;

    const dailyRate = addedLast30Days / 30;
    const remaining = cattleLimit - cattleCount;
    return Math.ceil(remaining / dailyRate);
}

module.exports = { getTenantLimits, getTenantUsage, forecastDaysToLimit, parseLimit };
