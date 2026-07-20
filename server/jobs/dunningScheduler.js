const cron = require('node-cron');
const db = require('../db');
const { sendBillingNoticeEmail } = require('../services/emailService');
const { logActivity } = require('../services/auditService');

// Days overdue (today - due_date) at which a farm's account is auto-suspended if
// still unpaid. Chosen as a generous grace period after the FINAL_NOTICE email.
const SUSPEND_AFTER_DAYS_OVERDUE = 10;

// Ordered so later stages always outrank earlier ones - used to make sure a stage
// is only sent once per invoice even if the cron catches up after a missed day
// (e.g. jumping straight from UPCOMING to OVERDUE skips FINAL_NOTICE, but never
// re-sends a stage that already went out).
const STAGE_RANK = { UPCOMING: 1, DUE_TODAY: 2, OVERDUE: 3, FINAL_NOTICE: 4, SUSPENDED: 5 };

function daysBetween(today, dueDate) {
    const a = new Date(today);
    const b = new Date(dueDate);
    return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

// Returns the dunning stage this invoice should be at right now, or null if none
// applies (paid/cancelled, or too far ahead of its due date to notify yet).
function stageForInvoice(status, daysOverdue) {
    if (status === 'PENDING') {
        if (daysOverdue >= 0) return 'DUE_TODAY';
        if (daysOverdue >= -3) return 'UPCOMING';
        return null;
    }
    if (status === 'OVERDUE') {
        if (daysOverdue >= SUSPEND_AFTER_DAYS_OVERDUE) return 'SUSPENDED';
        if (daysOverdue >= 7) return 'FINAL_NOTICE';
        if (daysOverdue >= 0) return 'OVERDUE';
    }
    return null;
}

// Runs the full daily dunning pass: mark newly-overdue invoices, send the
// appropriate reminder/notice email per invoice, and suspend farms that hit the
// grace period. Exported standalone (not just the cron wrapper) so it can be
// invoked directly from tests and, if ever needed, an admin "run now" button.
async function runDunningCheck() {
    const today = new Date().toISOString().split('T')[0];
    let emailsSent = 0, suspended = 0, failed = 0;

    try {
        await db.query(`
            UPDATE subscription_invoices SET status = 'OVERDUE', updated_at = NOW()
            WHERE status = 'PENDING' AND due_date < $1
        `, [today]);
        await db.query(`
            UPDATE tenant_subscriptions ts
            SET status = 'PAST_DUE', updated_at = NOW()
            FROM subscription_invoices si
            WHERE si.subscription_id = ts.id AND si.status = 'OVERDUE' AND ts.status = 'ACTIVE'
        `);
    } catch (err) {
        console.error('[DunningCron] Failed to mark overdue invoices:', err.message);
    }

    let invoices;
    try {
        const res = await db.query(`
            SELECT si.id, si.tenant_id, si.subscription_id, si.status, si.due_date, si.total_amount, si.currency, si.last_reminder_stage,
                   t.name as tenant_name, t.owner_name, t.owner_email, t.status as tenant_status
            FROM subscription_invoices si
            JOIN tenants t ON si.tenant_id = t.id
            WHERE si.status IN ('PENDING', 'OVERDUE')
        `);
        invoices = res.rows;
    } catch (err) {
        console.error('[DunningCron] Failed to load invoices:', err.message);
        return { emailsSent: 0, suspended: 0, failed: 0 };
    }

    for (const inv of invoices) {
        try {
            const daysOverdue = daysBetween(today, inv.due_date);
            const stage = stageForInvoice(inv.status, daysOverdue);
            if (!stage) continue;

            const currentRank = STAGE_RANK[inv.last_reminder_stage] || 0;
            if (STAGE_RANK[stage] <= currentRank) continue; // already sent this stage or later

            if (stage === 'SUSPENDED') {
                if (inv.tenant_status === 'ACTIVE') {
                    await db.query(
                        `UPDATE tenants SET status = 'SUSPENDED', suspended_by_dunning = true, updated_at = NOW() WHERE id = $1`,
                        [inv.tenant_id]
                    );
                    await logActivity(inv.tenant_id, null, 'UPDATE', 'TENANT', inv.tenant_id, {
                        message: `Farm auto-suspended by dunning: invoice overdue ${daysOverdue} days`
                    });
                    suspended++;
                }
            }

            if (inv.owner_email) {
                const result = await sendBillingNoticeEmail(inv.owner_email, inv.owner_name, inv.tenant_name, stage, {
                    amount: inv.total_amount,
                    currency: inv.currency,
                    dueDate: inv.due_date
                });
                if (result.success) emailsSent++;
            }

            await db.query(
                `UPDATE subscription_invoices SET last_reminder_stage = $1, last_reminder_sent_at = NOW() WHERE id = $2`,
                [stage, inv.id]
            );
        } catch (err) {
            failed++;
            console.error(`[DunningCron] Failed processing invoice ${inv.id}:`, err.message);
        }
    }

    console.log(`[DunningCron] Done. Emails sent: ${emailsSent}, Suspended: ${suspended}, Failed: ${failed}, Invoices checked: ${invoices.length}`);
    return { emailsSent, suspended, failed };
}

function startDunningSchedule() {
    // 08:00 server-local time, daily.
    cron.schedule('0 8 * * *', () => {
        runDunningCheck().catch(err => console.error('[DunningCron] Unhandled error:', err));
    });
    console.log('[DunningCron] Daily subscription dunning check scheduled for 08:00.');
}

module.exports = { startDunningSchedule, runDunningCheck, stageForInvoice, daysBetween };
