const express = require('express');
const router = express.Router();
const db = require('../db');
const { consumeToken } = require('../utils/paymentActionTokens');
const { settleAllDueForAnimal } = require('../utils/paymentSettlement');
const { sendPaymentStatusUpdateEmail } = require('../services/emailService');

// Public, unauthenticated - reached by clicking "Payment Received" / "Still Pending"
// in the farm owner's monthly billing email. The token itself IS the authorization
// (single-use, expiring, minted only into that specific email) - no login required,
// matching the app's existing password-reset/email-verification link pattern.
router.get('/', async (req, res) => {
    const { token, action } = req.query;

    if (!token || !['received', 'pending'].includes(action)) {
        return res.status(400).json({ ok: false, reason: 'INVALID_REQUEST' });
    }

    try {
        const consumed = await consumeToken(token, action);
        if (!consumed.ok) {
            return res.status(consumed.reason === 'NOT_FOUND' ? 404 : 410).json({ ok: false, reason: consumed.reason });
        }

        const { tenantId, cattleId } = consumed;

        const cattleRes = await db.query(
            `SELECT tag_number, owner_name, owner_email FROM cattle WHERE id = $1 AND tenant_id = $2`,
            [cattleId, tenantId]
        );
        if (cattleRes.rows.length === 0) {
            return res.status(404).json({ ok: false, reason: 'CATTLE_NOT_FOUND' });
        }
        const cattle = cattleRes.rows[0];

        const tenantRes = await db.query('SELECT name, owner_email, currency FROM tenants WHERE id = $1', [tenantId]);
        const tenant = tenantRes.rows[0];

        let amountDue = 0;
        if (action === 'received') {
            const result = await settleAllDueForAnimal(tenantId, cattleId, null);
            if (result.ok) amountDue = result.amountPaid;
        } else {
            const dueRes = await db.query(
                `SELECT SUM(amount) as total FROM payments WHERE tenant_id = $1 AND cattle_id = $2 AND status IN ('PENDING', 'OVERDUE')`,
                [tenantId, cattleId]
            );
            amountDue = dueRes.rows[0].total != null ? parseFloat(dueRes.rows[0].total) : 0;
        }

        if (cattle.owner_email) {
            sendPaymentStatusUpdateEmail(
                cattle.owner_email, cattle.owner_name, tenant?.owner_email, tenant?.name || 'FarmXpert',
                cattle.tag_number, action, amountDue, tenant?.currency || 'PKR'
            ).catch(e => console.error('Payment status update email failed:', e));
        }

        res.json({
            ok: true,
            action,
            animalTag: cattle.tag_number,
            ownerNotified: !!cattle.owner_email
        });
    } catch (err) {
        console.error('Payment action error:', err);
        res.status(500).json({ ok: false, reason: 'SERVER_ERROR' });
    }
});

module.exports = router;
