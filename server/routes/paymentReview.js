const express = require('express');
const router = express.Router();
const db = require('../db');
const { validateReviewToken } = require('../utils/paymentReviewTokens');
const { settleAllDueForAnimal } = require('../utils/paymentSettlement');
const { sendPaymentStatusUpdateEmail } = require('../services/emailService');

// Public, unauthenticated - reached via the single "Review & Update Payments" link
// in the farm owner's monthly billing email. Lists every animal still due this
// cycle so the owner can tick off the ones they've verified as paid (e.g. via
// bank statement) and confirm several at once, instead of acting on one animal
// at a time.
router.get('/', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ ok: false, reason: 'INVALID_REQUEST' });

    try {
        const validated = await validateReviewToken(token);
        if (!validated.ok) {
            return res.status(validated.reason === 'NOT_FOUND' ? 404 : 410).json({ ok: false, reason: validated.reason });
        }

        const tenantRes = await db.query('SELECT name, currency FROM tenants WHERE id = $1', [validated.tenantId]);
        const tenant = tenantRes.rows[0];

        const dueRes = await db.query(
            `SELECT
                c.id as cattle_id, c.tag_number, c.owner_name,
                SUM(p.amount) as total_due,
                MIN(p.due_date) as oldest_due_date,
                COUNT(p.id) as months_due,
                BOOL_OR(p.status = 'OVERDUE') as has_overdue
             FROM payments p
             JOIN cattle c ON p.cattle_id = c.id
             WHERE p.tenant_id = $1 AND p.status IN ('PENDING', 'OVERDUE') AND c.status = 'Active'
             GROUP BY c.id, c.tag_number, c.owner_name
             ORDER BY c.tag_number`,
            [validated.tenantId]
        );

        res.json({
            ok: true,
            farmName: tenant?.name || 'Farm',
            currency: tenant?.currency || 'PKR',
            animals: dueRes.rows.map(a => ({
                cattleId: a.cattle_id,
                tagNumber: a.tag_number,
                ownerName: a.owner_name,
                totalDue: parseFloat(a.total_due),
                monthsDue: parseInt(a.months_due, 10),
                status: a.has_overdue ? 'OVERDUE' : 'PENDING',
                oldestDueDate: a.oldest_due_date
            }))
        });
    } catch (err) {
        console.error('Payment review list error:', err);
        res.status(500).json({ ok: false, reason: 'SERVER_ERROR' });
    }
});

router.post('/', async (req, res) => {
    const { token, cattleIds } = req.body || {};
    if (!token || !Array.isArray(cattleIds) || cattleIds.length === 0) {
        return res.status(400).json({ ok: false, reason: 'INVALID_REQUEST' });
    }

    try {
        const validated = await validateReviewToken(token);
        if (!validated.ok) {
            return res.status(validated.reason === 'NOT_FOUND' ? 404 : 410).json({ ok: false, reason: validated.reason });
        }
        const tenantId = validated.tenantId;

        const tenantRes = await db.query('SELECT name, owner_email, currency FROM tenants WHERE id = $1', [tenantId]);
        const tenant = tenantRes.rows[0];

        const uniqueIds = [...new Set(cattleIds)];
        const results = [];

        for (const cattleId of uniqueIds) {
            const settled = await settleAllDueForAnimal(tenantId, cattleId, null);
            if (!settled.ok) {
                results.push({ cattleId, ok: false, reason: settled.reason });
                continue;
            }

            if (settled.cattle.owner_email) {
                sendPaymentStatusUpdateEmail(
                    settled.cattle.owner_email, settled.cattle.owner_name, tenant?.owner_email, tenant?.name || 'FarmXpert',
                    settled.cattle.tag_number, 'received', settled.amountPaid, tenant?.currency || 'PKR'
                ).catch(e => console.error('Payment status update email failed:', e));
            }

            results.push({ cattleId, ok: true, tagNumber: settled.cattle.tag_number, ownerNotified: !!settled.cattle.owner_email });
        }

        res.json({ ok: true, settledCount: results.filter(r => r.ok).length, results });
    } catch (err) {
        console.error('Payment review bulk-settle error:', err);
        res.status(500).json({ ok: false, reason: 'SERVER_ERROR' });
    }
});

module.exports = router;
