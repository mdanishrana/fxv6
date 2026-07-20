const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendBillingNoticeEmail } = require('../services/emailService');
const { logActivity } = require('../services/auditService');

const requireSaaSAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const userResult = await db.query('SELECT role FROM users WHERE id = $1', [decoded.userId]);
        if (userResult.rows.length === 0 || userResult.rows[0].role !== 'SAAS_ADMIN') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

router.get('/dashboard', requireSaaSAdmin, async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_subscriptions,
                COUNT(*) FILTER (WHERE status = 'TRIAL') as trial_subscriptions,
                COUNT(*) FILTER (WHERE status = 'PAST_DUE') as past_due_subscriptions,
                COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_subscriptions,
                COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN
                    CASE
                        WHEN billing_cycle = 'QUARTERLY' THEN amount / 3
                        WHEN billing_cycle = 'YEARLY' THEN amount / 12
                        ELSE amount
                    END
                ELSE 0 END), 0) as mrr
            FROM tenant_subscriptions
        `);
        
        const invoiceStats = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'PENDING') as pending_invoices,
                COUNT(*) FILTER (WHERE status = 'OVERDUE') as overdue_invoices,
                COALESCE(SUM(CASE WHEN status = 'PAID' AND EXTRACT(MONTH FROM paid_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM paid_date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN total_amount ELSE 0 END), 0) as revenue_this_month
            FROM subscription_invoices
        `);
        
        const row = stats.rows[0];
        const invRow = invoiceStats.rows[0];
        
        res.json({
            active_subscriptions: parseInt(row.active_subscriptions) || 0,
            trial_subscriptions: parseInt(row.trial_subscriptions) || 0,
            past_due_subscriptions: parseInt(row.past_due_subscriptions) || 0,
            cancelled_subscriptions: parseInt(row.cancelled_subscriptions) || 0,
            mrr: parseFloat(row.mrr) || 0,
            pending_invoices: parseInt(invRow.pending_invoices) || 0,
            overdue_invoices: parseInt(invRow.overdue_invoices) || 0,
            revenueThisMonth: parseFloat(invRow.revenue_this_month) || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Admin billing analytics: ARR, revenue over different windows, customer/churn
// counts, outstanding balance, and two 12-month trend series for charting.
// Revenue/subscription history is bucketed in JS after one query each rather
// than with SQL generate_series - the dataset (a handful of farms) is small
// enough that this is simpler to read and test than the equivalent SQL.
router.get('/analytics', requireSaaSAdmin, async (req, res) => {
    try {
        const mrrRes = await db.query(`
            SELECT COALESCE(SUM(
                CASE billing_cycle
                    WHEN 'QUARTERLY' THEN amount / 3
                    WHEN 'YEARLY' THEN amount / 12
                    ELSE amount
                END
            ), 0) as mrr
            FROM tenant_subscriptions WHERE status = 'ACTIVE'
        `);
        const mrr = parseFloat(mrrRes.rows[0].mrr) || 0;

        const revenueWindowsRes = await db.query(`
            SELECT
                COALESCE(SUM(total_amount) FILTER (WHERE paid_date = CURRENT_DATE), 0) as revenue_today,
                COALESCE(SUM(total_amount) FILTER (WHERE paid_date >= date_trunc('month', CURRENT_DATE)), 0) as revenue_this_month,
                COALESCE(SUM(total_amount) FILTER (WHERE paid_date >= date_trunc('year', CURRENT_DATE)), 0) as revenue_this_year,
                COALESCE(SUM(total_amount) FILTER (WHERE status IN ('PENDING', 'OVERDUE')), 0) as outstanding_amount
            FROM subscription_invoices WHERE status != 'CANCELLED'
        `);
        const rev = revenueWindowsRes.rows[0];

        const newCustomersRes = await db.query(
            `SELECT COUNT(*) FROM tenants WHERE created_at >= date_trunc('month', CURRENT_DATE)`
        );
        const cancellationsRes = await db.query(
            `SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'CANCELLED' AND cancelled_at >= date_trunc('month', CURRENT_DATE)`
        );
        const activeNowRes = await db.query(`SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'ACTIVE'`);

        // A renewal is a PAID invoice for a subscription that already had an
        // earlier PAID invoice before it - i.e. not that subscription's first
        // payment. Ties on paid_date (same calendar day) break on created_at,
        // since paid_date alone can't order two invoices paid the same day.
        const renewalsRes = await db.query(`
            SELECT COUNT(*) FROM subscription_invoices si
            WHERE si.status = 'PAID'
              AND si.paid_date >= date_trunc('month', CURRENT_DATE)
              AND EXISTS (
                  SELECT 1 FROM subscription_invoices earlier
                  WHERE earlier.subscription_id = si.subscription_id
                    AND earlier.status = 'PAID'
                    AND (earlier.paid_date < si.paid_date
                         OR (earlier.paid_date = si.paid_date AND earlier.created_at < si.created_at))
              )
        `);

        const newCustomersThisMonth = parseInt(newCustomersRes.rows[0].count);
        const cancellationsThisMonth = parseInt(cancellationsRes.rows[0].count);
        const activeNow = parseInt(activeNowRes.rows[0].count);
        // Approximation: active-at-start-of-month ~= active-now + cancelled-this-month
        // (ignores same-month signups that also cancelled, an edge case too rare to
        // bother modeling exactly for a dashboard metric).
        const activeAtStartOfMonth = activeNow + cancellationsThisMonth;
        const churnRatePct = activeAtStartOfMonth > 0 ? Math.round((cancellationsThisMonth / activeAtStartOfMonth) * 1000) / 10 : 0;

        // 12-month revenue trend from paid invoices.
        const paidInvoicesRes = await db.query(
            `SELECT paid_date, total_amount FROM subscription_invoices WHERE status = 'PAID' AND paid_date >= CURRENT_DATE - INTERVAL '12 months'`
        );
        const revenueByMonth = buildMonthlyBuckets(12, (bucket) => {
            let total = 0;
            for (const row of paidInvoicesRes.rows) {
                if (isInMonth(row.paid_date, bucket.year, bucket.month)) total += parseFloat(row.total_amount);
            }
            return Math.round(total * 100) / 100;
        }, 'revenue');

        // 12-month subscription growth: how many were active at the end of each month.
        const subsRes = await db.query(`SELECT start_date, cancelled_at, status FROM tenant_subscriptions`);
        const subscriptionGrowth = buildMonthlyBuckets(12, (bucket) => {
            const monthEnd = new Date(bucket.year, bucket.month + 1, 0, 23, 59, 59);
            return subsRes.rows.filter(s => {
                const started = new Date(s.start_date) <= monthEnd;
                const notYetCancelled = !s.cancelled_at || new Date(s.cancelled_at) > monthEnd;
                return started && notYetCancelled;
            }).length;
        }, 'active');

        // All-time revenue per farm, for the "Subscription Revenue by Farm" breakdown.
        const revenueByFarmRes = await db.query(`
            SELECT t.id as tenant_id, t.name as tenant_name, COALESCE(SUM(si.total_amount), 0) as revenue
            FROM tenants t
            LEFT JOIN subscription_invoices si ON si.tenant_id = t.id AND si.status = 'PAID'
            GROUP BY t.id, t.name
            HAVING COALESCE(SUM(si.total_amount), 0) > 0
            ORDER BY revenue DESC
        `);
        const revenueByFarm = revenueByFarmRes.rows.map(r => ({
            tenantId: r.tenant_id,
            tenantName: r.tenant_name,
            revenue: parseFloat(r.revenue)
        }));

        res.json({
            arr: Math.round(mrr * 12 * 100) / 100,
            mrr,
            revenueToday: parseFloat(rev.revenue_today) || 0,
            revenueThisMonth: parseFloat(rev.revenue_this_month) || 0,
            revenueThisYear: parseFloat(rev.revenue_this_year) || 0,
            outstandingAmount: parseFloat(rev.outstanding_amount) || 0,
            newCustomersThisMonth,
            renewalsThisMonth: parseInt(renewalsRes.rows[0].count),
            cancellationsThisMonth,
            churnRatePct,
            revenueByMonth,
            subscriptionGrowth,
            revenueByFarm
        });
    } catch (err) {
        console.error('Error fetching billing analytics:', err);
        res.status(500).json({ error: 'Failed to fetch billing analytics' });
    }
});

function isInMonth(dateVal, year, month) {
    if (!dateVal) return false;
    const d = new Date(dateVal);
    return d.getFullYear() === year && d.getMonth() === month;
}

// Builds an array of the last `count` months (oldest first), each labeled
// "YYYY-MM", with a `valueKey` computed by `compute(bucket)` for that month.
function buildMonthlyBuckets(count, compute, valueKey) {
    const now = new Date();
    const buckets = [];
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return buckets.map(b => ({
        month: `${b.year}-${String(b.month + 1).padStart(2, '0')}`,
        [valueKey]: compute(b)
    }));
}

router.get('/', requireSaaSAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT ts.*, t.name as tenant_name, t.owner_name, t.owner_email, 
                   sp.name as plan_name, sp.code as plan_code
            FROM tenant_subscriptions ts
            JOIN tenants t ON ts.tenant_id = t.id
            LEFT JOIN subscription_plans sp ON ts.plan_id = sp.id
            ORDER BY ts.created_at DESC
        `);
        res.json(result.rows.map(row => ({
            id: row.id,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            ownerName: row.owner_name,
            ownerEmail: row.owner_email,
            planId: row.plan_id,
            planName: row.plan_name,
            planCode: row.plan_code,
            status: row.status,
            billingCycle: row.billing_cycle,
            amount: parseFloat(row.amount),
            startDate: row.start_date,
            endDate: row.end_date,
            nextBillingDate: row.next_billing_date,
            trialEndsAt: row.trial_end_date,
            cancelledAt: row.cancelled_at,
            createdAt: row.created_at,
            discountType: row.discount_type,
            discountValue: row.discount_value !== null ? parseFloat(row.discount_value) : null
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
});

router.post('/', requireSaaSAdmin, async (req, res) => {
    const { tenantId, planId, billingCycle, amount, startDate, trialDays } = req.body;
    try {
        const nextBilling = new Date(startDate || Date.now());
        if (billingCycle === 'MONTHLY') nextBilling.setMonth(nextBilling.getMonth() + 1);
        else if (billingCycle === 'QUARTERLY') nextBilling.setMonth(nextBilling.getMonth() + 3);
        else if (billingCycle === 'YEARLY') nextBilling.setFullYear(nextBilling.getFullYear() + 1);

        let trialEndsAt = null;
        let status = 'ACTIVE';
        if (trialDays && trialDays > 0) {
            trialEndsAt = new Date(startDate || Date.now());
            trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
            status = 'TRIAL';
        }

        const result = await db.query(`
            INSERT INTO tenant_subscriptions 
            (tenant_id, plan_id, billing_cycle, amount, start_date, next_billing_date, trial_end_date, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [tenantId, planId, billingCycle || 'MONTHLY', amount, startDate || new Date(), nextBilling, trialEndsAt, status]);
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create subscription' });
    }
});

// Pause/Resume/Cancel are all just status transitions through this same route
// (PAUSED added to tenant_subscriptions_status_check alongside the existing
// values) - a paused subscription is naturally excluded from invoice generation
// since that query only matches status = 'ACTIVE'. Extend Trial goes through
// trialEndsAt, which - unlike the other fields here - wasn't previously exposed.
router.put('/:id', requireSaaSAdmin, async (req, res) => {
    const { id } = req.params;
    const { status, planId, amount, billingCycle, nextBillingDate, trialEndsAt, discountType, discountValue, clearDiscount } = req.body;

    if (!clearDiscount && discountType !== undefined && discountType !== null) {
        if (!['PERCENT', 'FIXED'].includes(discountType)) {
            return res.status(400).json({ error: 'discountType must be PERCENT or FIXED' });
        }
        if (discountValue === undefined || discountValue === null || !(Number(discountValue) > 0)) {
            return res.status(400).json({ error: 'discountValue must be a positive number' });
        }
        if (discountType === 'PERCENT' && Number(discountValue) > 100) {
            return res.status(400).json({ error: 'A percentage discount cannot exceed 100' });
        }
    }

    try {
        // clearDiscount is a separate flag (not just omitting discountType/Value)
        // because COALESCE can't tell "clear this field" from "field omitted" -
        // both arrive as a SQL NULL parameter. Same fix as the capacity-override
        // route needed after the same bug was caught there earlier this session.
        const result = await db.query(`
            UPDATE tenant_subscriptions
            SET status = COALESCE($1, status),
                plan_id = COALESCE($2, plan_id),
                amount = COALESCE($3, amount),
                billing_cycle = COALESCE($4, billing_cycle),
                next_billing_date = COALESCE($5, next_billing_date),
                trial_end_date = COALESCE($6, trial_end_date),
                discount_type = CASE WHEN $8 THEN NULL ELSE COALESCE($9, discount_type) END,
                discount_value = CASE WHEN $8 THEN NULL ELSE COALESCE($10, discount_value) END,
                cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN NOW() ELSE cancelled_at END,
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `, [status, planId, amount, billingCycle, nextBillingDate, trialEndsAt, id, !!clearDiscount, discountType, discountValue]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        await logActivity(result.rows[0].tenant_id, req.userId || null, 'UPDATE', 'SUBSCRIPTION', id, {
            message: 'Subscription updated by SaaS Admin',
            status: result.rows[0].status,
            trialEndDate: result.rows[0].trial_end_date,
            discountType: result.rows[0].discount_type,
            discountValue: result.rows[0].discount_value
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update subscription' });
    }
});

router.get('/invoices', requireSaaSAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT si.*, t.name as tenant_name, t.owner_name
            FROM subscription_invoices si
            JOIN tenants t ON si.tenant_id = t.id
            ORDER BY si.created_at DESC
            LIMIT 100
        `);
        res.json(result.rows.map(row => ({
            id: row.id,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            ownerName: row.owner_name,
            subscriptionId: row.subscription_id,
            invoiceNumber: row.invoice_number,
            amount: parseFloat(row.amount),
            taxAmount: parseFloat(row.tax_amount || 0),
            discountAmount: parseFloat(row.discount_amount || 0),
            totalAmount: parseFloat(row.total_amount),
            status: row.status,
            dueDate: row.due_date,
            paidDate: row.paid_date,
            paymentMethod: row.payment_method,
            notes: row.notes,
            billingPeriodStart: row.billing_period_start,
            billingPeriodEnd: row.billing_period_end,
            createdAt: row.created_at
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

router.post('/invoices', requireSaaSAdmin, async (req, res) => {
    const { tenantId, subscriptionId, amount, taxAmount, dueDate, billingPeriodStart, billingPeriodEnd, notes } = req.body;
    try {
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        const total = parseFloat(amount) + parseFloat(taxAmount || 0);
        
        const result = await db.query(`
            INSERT INTO subscription_invoices 
            (tenant_id, subscription_id, invoice_number, amount, tax_amount, total_amount, due_date, billing_period_start, billing_period_end, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [tenantId, subscriptionId, invoiceNumber, amount, taxAmount || 0, total, dueDate, billingPeriodStart, billingPeriodEnd, notes]);
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

router.put('/invoices/:id', requireSaaSAdmin, async (req, res) => {
    const { id } = req.params;
    const { status, paidDate, paymentMethod, notes } = req.body;
    try {
        const result = await db.query(`
            UPDATE subscription_invoices 
            SET status = COALESCE($1, status),
                paid_date = COALESCE($2, paid_date),
                payment_method = COALESCE($3, payment_method),
                notes = COALESCE($4, notes)
            WHERE id = $5
            RETURNING *
        `, [status, paidDate, paymentMethod, notes, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const invoice = result.rows[0];

        // Auto-reactivate a farm that dunning suspended for nonpayment, once this
        // invoice (or any other) is marked PAID. Farms an admin suspended manually
        // (suspended_by_dunning=false) are never touched here - see the note on
        // PUT /:tenantId/status where that flag is explicitly cleared on manual action.
        if (status === 'PAID' && invoice.tenant_id) {
            if (invoice.subscription_id) {
                await db.query(
                    `UPDATE tenant_subscriptions SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1 AND status = 'PAST_DUE'`,
                    [invoice.subscription_id]
                );
            }

            const tenantRes = await db.query('SELECT id, name, owner_name, owner_email, suspended_by_dunning FROM tenants WHERE id = $1', [invoice.tenant_id]);
            const tenant = tenantRes.rows[0];
            if (tenant && tenant.suspended_by_dunning) {
                await db.query(
                    `UPDATE tenants SET status = 'ACTIVE', suspended_by_dunning = false, updated_at = NOW() WHERE id = $1`,
                    [tenant.id]
                );
                await logActivity(tenant.id, req.userId || null, 'UPDATE', 'TENANT', tenant.id, {
                    message: 'Farm auto-reactivated after payment (was suspended for nonpayment)'
                });
                if (tenant.owner_email) {
                    sendBillingNoticeEmail(tenant.owner_email, tenant.owner_name, tenant.name, 'REACTIVATED', {}).catch(err =>
                        console.error('[Dunning] Failed to send reactivation email:', err.message)
                    );
                }
            }
        }

        res.json(invoice);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
});

router.post('/generate-invoices', requireSaaSAdmin, async (req, res) => {
    try {
        // Compares against Postgres's own CURRENT_DATE rather than a JS-computed
        // UTC date string - the two can disagree by a day right around midnight in
        // any timezone east of UTC (e.g. PKT, UTC+5), since new Date().toISOString()
        // is always UTC-anchored while a session's CURRENT_DATE follows the DB's
        // configured timezone. That mismatch intermittently caused subscriptions
        // due "today" to be silently skipped - caught via a flaky-looking test
        // failure that turned out to be a real, reproducible date-boundary bug.
        const subscriptions = await db.query(`
            SELECT ts.*, t.name as tenant_name
            FROM tenant_subscriptions ts
            JOIN tenants t ON ts.tenant_id = t.id
            WHERE ts.status = 'ACTIVE'
            AND ts.next_billing_date <= CURRENT_DATE
        `);

        let generated = 0;
        for (const sub of subscriptions.rows) {
            const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            const periodStart = sub.next_billing_date;
            const periodEnd = new Date(periodStart);
            
            if (sub.billing_cycle === 'MONTHLY') periodEnd.setMonth(periodEnd.getMonth() + 1);
            else if (sub.billing_cycle === 'QUARTERLY') periodEnd.setMonth(periodEnd.getMonth() + 3);
            else if (sub.billing_cycle === 'YEARLY') periodEnd.setFullYear(periodEnd.getFullYear() + 1);

            const subAmount = parseFloat(sub.amount);
            let discountAmount = 0;
            if (sub.discount_type === 'PERCENT') {
                discountAmount = subAmount * (parseFloat(sub.discount_value) / 100);
            } else if (sub.discount_type === 'FIXED') {
                discountAmount = parseFloat(sub.discount_value);
            }
            // A fixed discount larger than the subscription amount would make the
            // invoice negative - clamp so a farm is never billed less than zero.
            discountAmount = Math.min(discountAmount, subAmount);
            const totalAmount = Math.round((subAmount - discountAmount) * 100) / 100;

            await db.query(`
                INSERT INTO subscription_invoices
                (tenant_id, subscription_id, invoice_number, amount, tax_amount, discount_amount, total_amount, due_date, billing_period_start, billing_period_end)
                VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)
            `, [sub.tenant_id, sub.id, invoiceNumber, subAmount, discountAmount, totalAmount, periodStart, periodStart, periodEnd]);

            await db.query(`
                UPDATE tenant_subscriptions SET next_billing_date = $1, updated_at = NOW() WHERE id = $2
            `, [periodEnd, sub.id]);

            generated++;
        }

        res.json({ message: `Generated ${generated} invoices` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to generate invoices' });
    }
});

router.post('/check-overdue', requireSaaSAdmin, async (req, res) => {
    try {
        // Same CURRENT_DATE-vs-JS-date timezone reasoning as generate-invoices above.
        const result = await db.query(`
            UPDATE subscription_invoices
            SET status = 'OVERDUE'
            WHERE status = 'PENDING' AND due_date < CURRENT_DATE
            RETURNING id
        `);

        const overdueSubsResult = await db.query(`
            UPDATE tenant_subscriptions ts
            SET status = 'PAST_DUE', updated_at = NOW()
            FROM subscription_invoices si
            WHERE si.subscription_id = ts.id 
            AND si.status = 'OVERDUE'
            AND ts.status = 'ACTIVE'
            RETURNING ts.id
        `);

        res.json({ 
            overdueInvoices: result.rowCount,
            pastDueSubscriptions: overdueSubsResult.rowCount
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to check overdue' });
    }
});



module.exports = router;
