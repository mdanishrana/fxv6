const cron = require('node-cron');
const db = require('../db');
const { runMonthlyBillingCheckForTenant } = require('./billingReportSender');

/**
 * Runs the monthly billing check for every tenant. One tenant failing doesn't stop
 * the rest. Safe to call more than once for the same day - invoice generation is
 * idempotent, but note this WILL re-send the report email and mint fresh action
 * tokens for any animal still due, each time it runs.
 */
async function runMonthlyBillingCheckAllTenants(tenantIds = null) {
    console.log('[BillingCron] Starting monthly billing check');

    let tenants;
    try {
        tenants = tenantIds
            ? (await db.query('SELECT id, name FROM tenants WHERE id = ANY($1::uuid[])', [tenantIds])).rows
            : (await db.query('SELECT id, name FROM tenants')).rows;
    } catch (err) {
        console.error('[BillingCron] Failed to load tenants:', err);
        return;
    }

    let emailsSent = 0, noDue = 0, failed = 0;

    for (const tenant of tenants) {
        try {
            const outcome = await runMonthlyBillingCheckForTenant(tenant.id);
            if (!outcome.ok) {
                console.warn(`[BillingCron] Tenant ${tenant.id} (${tenant.name}) skipped: ${outcome.reason}`);
                continue;
            }
            if (outcome.emailSent) emailsSent++;
            else noDue++;
        } catch (err) {
            failed++;
            console.error(`[BillingCron] Failed processing tenant ${tenant.id} (${tenant.name}):`, err.message);
        }
    }

    console.log(`[BillingCron] Done. Emails sent: ${emailsSent}, Nothing due: ${noDue}, Failed: ${failed}, Total tenants: ${tenants.length}`);
}

function startBillingSchedule() {
    // 09:00 on the 2nd of every month, server-local time.
    cron.schedule('0 9 2 * *', () => {
        runMonthlyBillingCheckAllTenants().catch(err => console.error('[BillingCron] Unhandled error:', err));
    });
    console.log('[BillingCron] Monthly billing check scheduled for 09:00 on the 2nd of every month.');
}

module.exports = { startBillingSchedule, runMonthlyBillingCheckAllTenants };
