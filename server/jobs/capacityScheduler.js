const cron = require('node-cron');
const db = require('../db');
const { getTenantUsage } = require('../utils/planLimits');
const { sendCapacityWarningEmail } = require('../services/emailService');

const WARNING_THRESHOLD_PCT = 90;
// Once a farm is warned, don't warn again for this many days even if it's still
// over the threshold - avoids emailing the same owner daily while they decide
// whether to upgrade.
const RENOTIFY_AFTER_DAYS = 14;

// Daily pass: for every tenant with a plan limit (not unlimited), check cattle
// and user utilization and email the owner once they cross the warning
// threshold. Exported standalone (not just the cron wrapper) for tests and any
// future "run now" admin action.
async function runCapacityCheck() {
    let warned = 0, failed = 0;

    let tenants;
    try {
        tenants = (await db.query(
            `SELECT id, name, owner_name, owner_email, capacity_notice_sent_at FROM tenants WHERE status = 'ACTIVE'`
        )).rows;
    } catch (err) {
        console.error('[CapacityCron] Failed to load tenants:', err.message);
        return { warned: 0, failed: 0 };
    }

    for (const t of tenants) {
        try {
            if (t.capacity_notice_sent_at) {
                const daysSinceNotice = (Date.now() - new Date(t.capacity_notice_sent_at).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceNotice < RENOTIFY_AFTER_DAYS) continue;
            }

            const usage = await getTenantUsage(t.id);
            const overCattle = usage.cattleUtilizationPct !== null && usage.cattleUtilizationPct >= WARNING_THRESHOLD_PCT;
            const overUsers = usage.userUtilizationPct !== null && usage.userUtilizationPct >= WARNING_THRESHOLD_PCT;
            if (!overCattle && !overUsers) continue;

            // Cattle takes priority when both are over threshold - it's the more
            // common/urgent constraint for a farm (animal counts grow continuously;
            // user counts rarely do).
            const resource = overCattle ? 'animals' : 'users';
            const count = overCattle ? usage.cattleCount : usage.userCount;
            const limit = overCattle ? usage.cattleLimit : usage.userLimit;
            const utilizationPct = overCattle ? usage.cattleUtilizationPct : usage.userUtilizationPct;

            if (t.owner_email) {
                const result = await sendCapacityWarningEmail(t.owner_email, t.owner_name, t.name, { resource, count, limit, utilizationPct });
                if (result.success) warned++;
            }

            await db.query('UPDATE tenants SET capacity_notice_sent_at = NOW() WHERE id = $1', [t.id]);
        } catch (err) {
            failed++;
            console.error(`[CapacityCron] Failed processing tenant ${t.id}:`, err.message);
        }
    }

    console.log(`[CapacityCron] Done. Warned: ${warned}, Failed: ${failed}, Tenants checked: ${tenants.length}`);
    return { warned, failed };
}

function startCapacitySchedule() {
    // 08:30 server-local time, daily - just after the dunning check.
    cron.schedule('30 8 * * *', () => {
        runCapacityCheck().catch(err => console.error('[CapacityCron] Unhandled error:', err));
    });
    console.log('[CapacityCron] Daily capacity warning check scheduled for 08:30.');
}

module.exports = { startCapacitySchedule, runCapacityCheck };
