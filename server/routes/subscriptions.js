const express = require('express');
const router = express.Router();
const db = require('../db');

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
                COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN amount ELSE 0 END), 0) as mrr
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
            createdAt: row.created_at
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

router.put('/:id', requireSaaSAdmin, async (req, res) => {
    const { id } = req.params;
    const { status, planId, amount, billingCycle, nextBillingDate } = req.body;
    try {
        const result = await db.query(`
            UPDATE tenant_subscriptions 
            SET status = COALESCE($1, status),
                plan_id = COALESCE($2, plan_id),
                amount = COALESCE($3, amount),
                billing_cycle = COALESCE($4, billing_cycle),
                next_billing_date = COALESCE($5, next_billing_date),
                cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN NOW() ELSE cancelled_at END,
                updated_at = NOW()
            WHERE id = $6
            RETURNING *
        `, [status, planId, amount, billingCycle, nextBillingDate, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found' });
        }
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
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
});

router.post('/generate-invoices', requireSaaSAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const subscriptions = await db.query(`
            SELECT ts.*, t.name as tenant_name
            FROM tenant_subscriptions ts
            JOIN tenants t ON ts.tenant_id = t.id
            WHERE ts.status = 'ACTIVE' 
            AND ts.next_billing_date <= $1
        `, [today]);

        let generated = 0;
        for (const sub of subscriptions.rows) {
            const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            const periodStart = sub.next_billing_date;
            const periodEnd = new Date(periodStart);
            
            if (sub.billing_cycle === 'MONTHLY') periodEnd.setMonth(periodEnd.getMonth() + 1);
            else if (sub.billing_cycle === 'QUARTERLY') periodEnd.setMonth(periodEnd.getMonth() + 3);
            else if (sub.billing_cycle === 'YEARLY') periodEnd.setFullYear(periodEnd.getFullYear() + 1);

            await db.query(`
                INSERT INTO subscription_invoices 
                (tenant_id, subscription_id, invoice_number, amount, tax_amount, total_amount, due_date, billing_period_start, billing_period_end)
                VALUES ($1, $2, $3, $4, 0, $4, $5, $6, $7)
            `, [sub.tenant_id, sub.id, invoiceNumber, sub.amount, periodStart, periodStart, periodEnd]);

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
        const today = new Date().toISOString().split('T')[0];
        const result = await db.query(`
            UPDATE subscription_invoices 
            SET status = 'OVERDUE'
            WHERE status = 'PENDING' AND due_date < $1
            RETURNING id
        `, [today]);

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

router.get('/farm-payments/:tenantId', requireSaaSAdmin, async (req, res) => {
    const { tenantId } = req.params;
    try {
        const result = await db.query(`
            SELECT p.*, c.tag_number, c.owner_name, c.owner_email, c.owner_mobile
            FROM payments p
            JOIN cattle c ON p.cattle_id = c.id
            WHERE p.tenant_id = $1
            ORDER BY p.due_date DESC
        `, [tenantId]);
        
        res.json(result.rows.map(row => ({
            id: row.id,
            cattleId: row.cattle_id,
            cattleTag: row.tag_number,
            ownerName: row.owner_name,
            ownerEmail: row.owner_email,
            ownerMobile: row.owner_mobile,
            amount: parseFloat(row.amount),
            dueDate: row.due_date,
            paidDate: row.paid_date,
            status: row.status,
            paymentMethod: row.payment_method,
            notes: row.notes,
            reminderSent: row.reminder_sent
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch farm payments' });
    }
});

router.get('/dashboard', requireSaaSAdmin, async (req, res) => {
    try {
        const mrr = await db.query(`
            SELECT COALESCE(SUM(
                CASE 
                    WHEN billing_cycle = 'MONTHLY' THEN amount
                    WHEN billing_cycle = 'QUARTERLY' THEN amount / 3
                    WHEN billing_cycle = 'YEARLY' THEN amount / 12
                END
            ), 0) as mrr
            FROM tenant_subscriptions WHERE status IN ('ACTIVE', 'TRIAL')
        `);

        const stats = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_subscriptions,
                COUNT(*) FILTER (WHERE status = 'TRIAL') as trial_subscriptions,
                COUNT(*) FILTER (WHERE status = 'PAST_DUE') as past_due_subscriptions,
                COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_subscriptions
            FROM tenant_subscriptions
        `);

        const invoiceStats = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'PENDING') as pending_invoices,
                COUNT(*) FILTER (WHERE status = 'OVERDUE') as overdue_invoices,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID' AND paid_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as revenue_this_month
            FROM subscription_invoices
        `);

        res.json({
            mrr: parseFloat(mrr.rows[0].mrr),
            ...stats.rows[0],
            ...invoiceStats.rows[0],
            revenueThisMonth: parseFloat(invoiceStats.rows[0].revenue_this_month || 0)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

module.exports = router;
