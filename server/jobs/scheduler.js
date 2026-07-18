const cron = require('node-cron');
const db = require('../db');
const { processDailyFeedForTenant } = require('./dailyFeedProcessor');
const { sendLowStockAlertForTenant } = require('../utils/lowStockAlert');

/**
 * Runs feed processing for today's date, for every tenant (or, when tenantIds is
 * given, only that subset - used by tests to avoid touching unrelated tenants
 * that may exist concurrently in a shared test database). Tenants that already had
 * it processed manually today, or have no active animals, are skipped (not errors).
 * One tenant failing doesn't stop the rest.
 */
async function runNightlyFeedProcessing(tenantIds = null) {
    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`[FeedCron] Starting nightly feed processing for ${todayStr}`);

    let tenants;
    try {
        tenants = tenantIds
            ? (await db.query('SELECT id, name FROM tenants WHERE id = ANY($1::uuid[])', [tenantIds])).rows
            : (await db.query('SELECT id, name FROM tenants')).rows;
    } catch (err) {
        console.error('[FeedCron] Failed to load tenants:', err);
        return;
    }

    let processed = 0, skipped = 0, failed = 0;

    for (const tenant of tenants) {
        try {
            const outcome = await processDailyFeedForTenant(tenant.id, todayStr);
            if (!outcome.ok) {
                skipped++;
                continue;
            }
            processed++;
            if (outcome.newlyLowStock.length > 0) {
                sendLowStockAlertForTenant(tenant.id, outcome.newlyLowStock)
                    .catch(err => console.error(`[FeedCron] Low stock alert failed for tenant ${tenant.id}:`, err));
            }
        } catch (err) {
            failed++;
            console.error(`[FeedCron] Failed processing tenant ${tenant.id} (${tenant.name}):`, err.message);
        }
    }

    console.log(`[FeedCron] Done. Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}, Total tenants: ${tenants.length}`);
}

function startFeedProcessingSchedule() {
    // 00:15 every day, server-local time - late enough that "today's" weigh-ins are in.
    cron.schedule('15 0 * * *', () => {
        runNightlyFeedProcessing().catch(err => console.error('[FeedCron] Unhandled error:', err));
    });
    console.log('[FeedCron] Nightly feed processing scheduled for 00:15 daily.');
}

module.exports = { startFeedProcessingSchedule, runNightlyFeedProcessing };
