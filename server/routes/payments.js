const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');
const { authMiddleware } = require('../middleware/auth');
const { settleAllDueForAnimal } = require('../utils/paymentSettlement');
const { runMonthlyBillingCheckForTenant } = require('../jobs/billingReportSender');

router.use(authMiddleware);
router.use((req, res, next) => {
    req.tenantId = req.user.tenantId;
    next();
});

router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.*, c.tag_number, c.owner_name, c.owner_email, c.owner_mobile
             FROM payments p
             JOIN cattle c ON p.cattle_id = c.id
             WHERE p.tenant_id = $1 ${req.query.cattleId ? 'AND p.cattle_id = $2' : ''}
             ORDER BY p.due_date DESC`,
            req.query.cattleId ? [req.tenantId, req.query.cattleId] : [req.tenantId]
        );
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
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

router.post('/', async (req, res) => {
    const p = req.body;
    try {
        const result = await db.query(
            `INSERT INTO payments (tenant_id, cattle_id, amount, due_date, status, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [req.tenantId, p.cattleId, p.amount, p.dueDate, p.status || 'PENDING', p.notes || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const p = req.body;
    try {
        const result = await db.query(
            `UPDATE payments SET
                status = COALESCE($1, status),
                paid_date = COALESCE($2, paid_date),
                payment_method = COALESCE($3, payment_method),
                notes = COALESCE($4, notes),
                updated_at = NOW()
             WHERE id = $5 AND tenant_id = $6
             RETURNING *`,
            [p.status, p.paidDate, p.paymentMethod, p.notes, id, req.tenantId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update payment' });
    }
});

router.delete('/cattle/:cattleId', async (req, res) => {
    try {
        const result = await db.query(`DELETE FROM payments WHERE cattle_id = $1 AND tenant_id = $2`, [req.params.cattleId, req.tenantId]);
        res.json({ message: result.rowCount === 0 ? 'Data is already perfectly clean! This animal currently has 0 payment records.' : `Successfully wiped ${result.rowCount} payment records!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to clear payments' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await db.query(`DELETE FROM payments WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
        res.json({ message: 'Payment deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete payment' });
    }
});


// Runs the same monthly billing check the automated cron runs on the 2nd of each
// month: generates any missing calendar-month invoices (prorated for an animal's
// first partial month), marks overdue ones, and - if anything is due - emails the
// farm owner a report with one-click Payment Received/Still Pending action links.
// Kept as an on-demand "Run Checks" button alongside the automatic monthly run.
router.post('/generate-monthly', async (req, res) => {
    try {
        const outcome = await runMonthlyBillingCheckForTenant(req.tenantId);

        if (!outcome.ok) {
            if (outcome.reason === 'NO_OWNER_EMAIL') {
                return res.json({
                    message: `Generated ${outcome.invoicesCreated} invoice(s), ${outcome.dueCount} animal(s) due - but no owner email is set for this farm, so no report was sent.`
                });
            }
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const message = outcome.dueCount === 0
            ? `Check complete: generated ${outcome.invoicesCreated} invoice(s). Nothing currently due.`
            : `Check complete: generated ${outcome.invoicesCreated} invoice(s). ${outcome.dueCount} animal(s) due - report ${outcome.emailSent ? 'emailed to farm owner' : 'FAILED to send'}.`;

        res.json({ message });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to run monthly billing check' });
    }
});

// GET /summary - Aggregated view for Option B
router.get('/summary', async (req, res) => {
    try {
        // Fetch raw statistics. Note: If an animal has NO payments, it won't have a status_priority
        // so we need a LEFT JOIN from cattle to payments to ensure all cattle are covered.
        const result = await db.query(
            `SELECT 
                c.id as cattle_id, 
                c.tag_number, 
                c.owner_name, 
                c.owner_email, 
                c.owner_mobile,
                COALESCE(SUM(CASE WHEN p.status IN ('PENDING', 'OVERDUE') THEN p.amount ELSE 0 END), 0) as total_due, 
                MIN(CASE WHEN p.status IN ('PENDING', 'OVERDUE') THEN p.due_date END) as oldest_due_date, 
                COUNT(CASE WHEN p.status IN ('PENDING', 'OVERDUE') THEN 1 END) as months_due,
                COALESCE(MAX(CASE WHEN p.status = 'OVERDUE' THEN 2 WHEN p.status = 'PENDING' THEN 1 ELSE 0 END), 0) as status_priority,
                COALESCE(MAX(CASE WHEN p.status = 'PAID' AND p.due_date > CURRENT_DATE THEN 1 ELSE 0 END), 0) as has_advance_paid,
                COUNT(p.id) as total_records
             FROM cattle c
             LEFT JOIN payments p ON c.id = p.cattle_id
             WHERE c.tenant_id = $1 AND c.status = 'Active'
             GROUP BY c.id, c.tag_number, c.owner_name, c.owner_email, c.owner_mobile`,
            [req.tenantId]
        );

        // Fetch last payment dates
        const lastPayments = await db.query(
            `SELECT cattle_id, MAX(paid_date) as last_paid 
             FROM payments 
             WHERE tenant_id = $1 AND status = 'PAID'
             GROUP BY cattle_id`,
            [req.tenantId]
        );

        const lastPaidMap = {};
        lastPayments.rows.forEach(r => {
            lastPaidMap[r.cattle_id] = r.last_paid;
        });

        const summary = result.rows.map(row => {
            let finalStatus = 'PAID';
            
            if (row.status_priority === 2) {
                finalStatus = 'OVERDUE';
            } else if (row.status_priority === 1) {
                finalStatus = 'PENDING';
            } else if (parseInt(row.total_records) === 0) {
                finalStatus = 'PAID'; // Safe PAID status for animals with zero billing records
            } else if (row.has_advance_paid > 0) {
                finalStatus = 'ADVANCE_PAID';
            }

            return {
                cattleId: row.cattle_id,
                tagNumber: row.tag_number,
                ownerName: row.owner_name,
                ownerEmail: row.owner_email,
                ownerMobile: row.owner_mobile,
                totalDue: parseFloat(row.total_due),
                oldestDueDate: row.oldest_due_date,
                monthsDue: parseInt(row.months_due),
                status: finalStatus,
                reminderSent: false, // Reminder logic omitted for left join simplicity,
                lastPaidDate: lastPaidMap[row.cattle_id] || null
            };
        });

        res.json(summary);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch payment summary' });
    }
});

// POST /settle/:cattleId - Pay off all debt for an animal
router.post('/settle/:cattleId', async (req, res) => {
    const { cattleId } = req.params;
    try {
        const result = await settleAllDueForAnimal(req.tenantId, cattleId, req.body.amountPaid);

        if (!result.ok) {
            const message = result.reason === 'CATTLE_NOT_FOUND'
                ? 'Animal not found'
                : 'No unpaid dues found for this animal and no advance payment provided';
            return res.status(400).json({ error: message });
        }

        const { cattle, amountPaid, totalAmountDue } = result;
        const paidDate = new Date().toISOString().split('T')[0];

        // Send Confirmation Email + Push (Non-blocking)
        if (cattle.owner_email) {
            const tRes = await db.query('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);
            const tenantName = tRes.rows[0]?.name || 'FarmXpert';

            if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
                });
                transporter.sendMail({
                    from: `"${tenantName}" <${process.env.GMAIL_USER}>`,
                    to: cattle.owner_email,
                    subject: `Payment Received - Cattle ${cattle.tag_number}`,
                    html: `
                        <h2>Payment Confirmation</h2>
                        <p>Dear ${cattle.owner_name},</p>
                        <p>We have received your payment of <strong>PKR ${amountPaid.toLocaleString()}</strong> for animal <strong>${cattle.tag_number}</strong>.</p>
                        <p><strong>Date:</strong> ${paidDate}</p>
                        <p>Thank you for your timely payment.</p>
                        <p>Regards,<br/>${tenantName}</p>
                    `
                }).catch(e => console.error("Email failed", e));
            }

            const { sendToEmail } = require('../services/notificationService');
            sendToEmail(
                cattle.owner_email,
                `Payment Received - ${cattle.tag_number}`,
                `We received PKR ${amountPaid.toLocaleString()}. Thank you!`
            ).catch(e => console.error("Push failed", e));
        }

        res.json({ success: true, message: 'Payment settled successfully', totalPaid: amountPaid });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to settle payments' });
    }
});

// POST /remind/:cattleId - Manual Reminder
router.post('/remind/:cattleId', async (req, res) => {
    const { cattleId } = req.params;
    try {
        // Get Aggregated Info for ALL unpaid items (PENDING + OVERDUE)
        const info = await db.query(
            `SELECT 
                SUM(p.amount) as total_due, 
                MIN(p.due_date) as oldest_due,
                c.tag_number, c.owner_name, c.owner_email,
                BOOL_OR(p.status = 'OVERDUE') as has_overdue
             FROM payments p
             JOIN cattle c ON p.cattle_id = c.id
             WHERE p.tenant_id = $1 AND p.cattle_id = $2 AND (p.status = 'PENDING' OR p.status = 'OVERDUE')
             GROUP BY c.tag_number, c.owner_name, c.owner_email`,
            [req.tenantId, cattleId]
        );

        if (info.rows.length === 0) {
            return res.status(400).json({ error: 'No unpaid payments found for this animal' });
        }

        const data = info.rows[0];
        const tenantRes = await db.query('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);
        const tenantName = tenantRes.rows[0]?.name || 'Farm';

        // dynamic subject/body
        const isOverdue = data.has_overdue;
        const subject = isOverdue
            ? `Payment Overdue - Cattle ${data.tag_number}`
            : `Payment Reminder - Cattle ${data.tag_number}`;

        const content = isOverdue
            ? `This is a reminder that payments totaling <strong>Rs. ${parseFloat(data.total_due).toLocaleString()}</strong> for animal <strong>${data.tag_number}</strong> are overdue. The oldest invoice was due on <strong>${new Date(data.oldest_due).toLocaleDateString()}</strong>.`
            : `This is a reminder that you have pending payments totaling <strong>Rs. ${parseFloat(data.total_due).toLocaleString()}</strong> for animal <strong>${data.tag_number}</strong>. Please arrange payment by the due date: ${new Date(data.oldest_due).toLocaleDateString()}.`;

        // Send Email
        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && data.owner_email) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
            });

            await transporter.sendMail({
                from: `"${tenantName}" <${process.env.GMAIL_USER}>`,
                to: data.owner_email,
                subject: subject,
                html: `
                    <h2>${isOverdue ? 'Payment Overdue Notice' : 'Payment Reminder'}</h2>
                    <p>Dear ${data.owner_name},</p>
                    <p>${content}</p>
                    <p>Thank you.</p>
                `
            });

            // Send Push
            const { sendToEmail } = require('../services/notificationService');
            sendToEmail(
                data.owner_email,
                subject,
                content.replace(/<[^>]*>?/gm, '')
            ).catch(e => console.error("Push failed", e));

            // Update reminder flag on all included items
            await db.query(
                `UPDATE payments SET reminder_sent = TRUE, updated_at = NOW() 
                 WHERE tenant_id = $1 AND cattle_id = $2 AND (status = 'PENDING' OR status = 'OVERDUE')`,
                [req.tenantId, cattleId]
            );

            res.json({ success: true, message: 'Reminder sent successfully' });
        } else {
            res.status(400).json({ error: 'Email configuration missing or owner has no email' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
});


module.exports = router;
