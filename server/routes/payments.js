const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');

const requireTenant = (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'Missing Tenant ID' });
    req.tenantId = tenantId;
    next();
};

router.use(requireTenant);

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


router.post('/generate-monthly', async (req, res) => {
    try {
        const cattleResult = await db.query(
            `SELECT id, entry_date, monthly_charges FROM cattle 
             WHERE tenant_id = $1 AND status = 'Active' AND monthly_charges > 0`,
            [req.tenantId]
        );

        let created = 0;
        const todayStr = new Date().toISOString().split('T')[0];
        const todayDate = new Date(todayStr);

        for (const cattle of cattleResult.rows) {
            if (!cattle.entry_date) continue;

            const latestRes = await db.query(
                `SELECT due_date FROM payments 
                 WHERE tenant_id = $1 AND cattle_id = $2 
                 ORDER BY due_date DESC LIMIT 1`,
                [req.tenantId, cattle.id]
            );

            let latestDate;
            if (latestRes.rows.length === 0) {
                // Create initial payment for entry_date (arrival date)
                await db.query(
                    `INSERT INTO payments (tenant_id, cattle_id, amount, due_date, status, notes)
                     VALUES ($1, $2, $3, $4, 'PENDING', 'Initial Arrival Payment')`,
                    [req.tenantId, cattle.id, cattle.monthly_charges, cattle.entry_date]
                );
                created++;
                latestDate = new Date(cattle.entry_date);
            } else {
                latestDate = new Date(latestRes.rows[0].due_date);
            }

            // Check if at least 30 days have passed since the latest invoice date
            const diffTime = todayDate.getTime() - latestDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 30) {
                const latestDateStr = latestDate.toISOString().split('T')[0];
                // Ensure we don't insert a duplicate for today
                if (latestDateStr !== todayStr) {
                    await db.query(
                        `INSERT INTO payments (tenant_id, cattle_id, amount, due_date, status, notes)
                         VALUES ($1, $2, $3, $4, 'PENDING', 'Monthly Checkin/Cycle')`,
                        [req.tenantId, cattle.id, cattle.monthly_charges, todayStr]
                    );
                    created++;
                }
            }
        }

        res.json({ message: `Daily Cycle Check complete: Generated ${created} missing invoices` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to generate monthly payments' });
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
    const client = await db.pool.connect(); // Use transaction

    try {
        await client.query('BEGIN');

        // Fetch Owner and Billing Details early
        const cattleRes = await client.query(
            `SELECT tag_number, owner_name, owner_email, monthly_charges, entry_date FROM cattle WHERE id = $1`,
            [cattleId]
        );
        const cattle = cattleRes.rows[0];
        const monthlyCharges = parseFloat(cattle.monthly_charges || 0);

        // 1. Get total amount currently pending before updating
        const dueResult = await client.query(
            `SELECT SUM(amount) as total, STRING_AGG(id::text, ',') as ids
             FROM payments 
             WHERE tenant_id = $1 AND cattle_id = $2 AND (status = 'PENDING' OR status = 'OVERDUE')`,
             [req.tenantId, cattleId]
        );

        const totalAmountDue = dueResult.rows[0].total != null ? parseFloat(dueResult.rows[0].total) : 0;
        const amountPaid = req.body.amountPaid ? parseFloat(req.body.amountPaid) : totalAmountDue;
        const paidDate = new Date().toISOString().split('T')[0];

        if (totalAmountDue === 0 && amountPaid <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No unpaid dues found for this animal and no advance payment provided' });
        }

        // 2. Mark existing pending/overdue as PAID
        if (totalAmountDue > 0) {
            await client.query(
                `UPDATE payments 
                 SET status = 'PAID', paid_date = $1, payment_method = 'Cash', updated_at = NOW()
                 WHERE tenant_id = $2 AND cattle_id = $3 AND (status = 'PENDING' OR status = 'OVERDUE')`,
                [paidDate, req.tenantId, cattleId]
            );
        }

        // 3. Handle Advance/Overpayments safely
        if (amountPaid > totalAmountDue && monthlyCharges > 0 && cattle.entry_date) {
            const overpayment = amountPaid - totalAmountDue;
            const extraMonths = Math.floor(overpayment / monthlyCharges);
            
            if (extraMonths > 0) {
                const existingRes = await client.query(
                    `SELECT COUNT(*) as count FROM payments WHERE tenant_id = $1 AND cattle_id = $2`,
                    [req.tenantId, cattleId]
                );
                const existingBillsCount = parseInt(existingRes.rows[0].count, 10);
                const entryDate = new Date(cattle.entry_date);

                for (let i = 0; i < extraMonths; i++) {
                    const nextDate = new Date(entryDate);
                    nextDate.setDate(nextDate.getDate() + ((existingBillsCount + i) * 30));
                    
                    await client.query(
                        `INSERT INTO payments (tenant_id, cattle_id, amount, due_date, status, paid_date, payment_method, notes)
                         VALUES ($1, $2, $3, $4, 'PAID', $5, 'Cash', 'Advance Payment')`,
                        [req.tenantId, cattleId, monthlyCharges, nextDate.toISOString().split('T')[0], paidDate]
                    );
                }
            }
        }

        await client.query('COMMIT');

        // 4. Send Confirmation Email (Non-blocking)
        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && cattle.owner_email) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
            });

            // Fetch tenant name
            const tRes = await db.query('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);
            const tenantName = tRes.rows[0]?.name || 'FarmXpert';

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

        // 5. Send Push Notification
        const { sendToEmail } = require('../services/notificationService');
        if (cattle.owner_email) {
            sendToEmail(
                cattle.owner_email,
                `Payment Received - ${cattle.tag_number}`,
                `We received PKR ${amountPaid.toLocaleString()}. Thank you!`
            ).catch(e => console.error("Push failed", e));
        }

        res.json({ success: true, message: 'Payment settled successfully', totalPaid: amountPaid });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to settle payments' });
    } finally {
        client.release();
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

// Check Overdue + Send 'Due Today' Reminders
router.post('/check-overdue', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Mark as OVERDUE if due_date < today
        const result = await db.query(
            `UPDATE payments 
             SET status = 'OVERDUE', reminder_sent = FALSE, updated_at = NOW()
             WHERE tenant_id = $1 AND status = 'PENDING' AND due_date < $2`,
            [req.tenantId, today]
        );

        let emailsSent = 0;

        if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
            });

            const tenantRes = await db.query('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);
            const tenantName = tenantRes.rows[0]?.name;

            // 2. Identify "Due Today" items that haven't been reminded
            const dueToday = await db.query(
                `SELECT p.*, c.tag_number, c.owner_name, c.owner_email
                 FROM payments p
                 JOIN cattle c ON p.cattle_id = c.id
                 WHERE p.tenant_id = $1 AND p.status = 'PENDING' AND p.due_date = $2 AND p.reminder_sent = FALSE
                   AND c.owner_email IS NOT NULL AND c.owner_email != ''`,
                [req.tenantId, today]
            );

            // Group by cattle to send one email per animal
            const processedDue = new Set();
            for (const payment of dueToday.rows) {
                if (processedDue.has(payment.cattle_id)) continue;
                processedDue.add(payment.cattle_id);

                const totalRes = await db.query(
                    `SELECT SUM(amount) as total FROM payments 
                     WHERE cattle_id = $1 AND due_date = $2 AND status = 'PENDING'`,
                    [payment.cattle_id, today]
                );
                const totalAmt = totalRes.rows[0].total;

                try {
                    await transporter.sendMail({
                        from: `"${tenantName}" <${process.env.GMAIL_USER}>`,
                        to: payment.owner_email,
                        subject: `Payment Due Today - Cattle ${payment.tag_number}`,
                        html: `
                            <h2>Payment Due Notification</h2>
                            <p>Dear ${payment.owner_name},</p>
                            <p>This is a reminder that a payment of <strong>Rs. ${parseFloat(totalAmt).toLocaleString()}</strong> for animal <strong>${payment.tag_number}</strong> is due <strong>TODAY</strong>.</p>
                            <p>Please arrange payment to avoid overdue charges.</p>
                            <p>Thank you.</p>
                        `
                    });
                    // Mark reminder_sent = TRUE for due today items
                    await db.query(
                        `UPDATE payments SET reminder_sent = TRUE WHERE tenant_id = $1 AND cattle_id = $2 AND due_date = $3 AND status = 'PENDING'`,
                        [req.tenantId, payment.cattle_id, today]
                    );
                    emailsSent++;

                    // Send Push
                    const { sendToEmail } = require('../services/notificationService');
                    sendToEmail(
                        payment.owner_email,
                        `Payment Due Today - ${payment.tag_number}`,
                        `Payment of Rs. ${parseFloat(totalAmt).toLocaleString()} is due today.`
                    ).catch(e => console.error("Push failed", e));

                } catch (e) { console.error(e); }
            }

            // 3. Process Overdue (Existing Logic) - Send reminders for OVERDUE items not yet reminded
            // (Similar logic to step 2 but for OVERDUE status)
            // ... (We can reuse or keep simple if user focus is just on the Due Today part primarily, but let's be thorough)
            // For now, let's assume the previous logic for Overdue bulk sending was good, but let's ensure we don't spam.
            // The `reminder_sent = FALSE` reset in step 1 ensures newly overdue get a fresh email.

            const overduePayments = await db.query(
                `SELECT p.*, c.tag_number, c.owner_name, c.owner_email
                 FROM payments p
                 JOIN cattle c ON p.cattle_id = c.id
                 WHERE p.tenant_id = $1 AND p.status = 'OVERDUE' AND p.reminder_sent = FALSE
                   AND c.owner_email IS NOT NULL AND c.owner_email != ''`,
                [req.tenantId]
            );

            const processedOverdue = new Set();
            for (const payment of overduePayments.rows) {
                if (processedOverdue.has(payment.cattle_id)) continue;
                processedOverdue.add(payment.cattle_id);

                const totalRes = await db.query(
                    `SELECT SUM(amount) as total FROM payments 
                     WHERE cattle_id = $1 AND status = 'OVERDUE'`,
                    [payment.cattle_id]
                );

                try {
                    await transporter.sendMail({
                        from: `"${tenantName}" <${process.env.GMAIL_USER}>`,
                        to: payment.owner_email,
                        subject: `Payment Overdue - Cattle ${payment.tag_number}`,
                        html: `
                            <h2>Payment Overdue Notice</h2>
                            <p>Dear ${payment.owner_name},</p>
                            <p>This is a reminder that payments totaling <strong>Rs. ${parseFloat(totalRes.rows[0].total).toLocaleString()}</strong> for animal <strong>${payment.tag_number}</strong> are now <strong>OVERDUE</strong>.</p>
                            <p>Please arrange payment immediately.</p>
                            <p>Thank you.</p>
                        `
                    });
                    await db.query(
                        `UPDATE payments SET reminder_sent = TRUE WHERE tenant_id = $1 AND cattle_id = $2 AND status = 'OVERDUE'`,
                        [req.tenantId, payment.cattle_id]
                    );
                    emailsSent++;

                    // Send Push
                    const { sendToEmail } = require('../services/notificationService');
                    sendToEmail(
                        payment.owner_email,
                        `Payment Overdue - ${payment.tag_number}`,
                        `Payments totaling Rs. ${parseFloat(totalRes.rows[0].total).toLocaleString()} are OVERDUE.`
                    ).catch(e => console.error("Push failed", e));

                } catch (e) { console.error(e); }
            }
        }

        res.json({
            overdueCount: result.rowCount,
            emailsSent,
            message: `Daily checks complete. Updated ${result.rowCount} items to Overdue. Sent ${emailsSent} emails.`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to run daily checks' });
    }
});

module.exports = router;
