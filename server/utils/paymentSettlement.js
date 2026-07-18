const db = require('../db');

/**
 * Marks all of an animal's PENDING/OVERDUE payments as PAID, handling advance
 * overpayment by generating future-dated PAID invoices. Shared between the
 * authenticated "Settle Payment" flow (PaymentManager UI) and the public
 * one-click "Payment Received" email action, so both behave identically.
 */
async function settleAllDueForAnimal(tenantId, cattleId, amountPaidInput) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const cattleRes = await client.query(
            `SELECT tag_number, owner_name, owner_email, monthly_charges, entry_date FROM cattle WHERE id = $1 AND tenant_id = $2`,
            [cattleId, tenantId]
        );
        if (cattleRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { ok: false, reason: 'CATTLE_NOT_FOUND' };
        }
        const cattle = cattleRes.rows[0];
        const monthlyCharges = parseFloat(cattle.monthly_charges || 0);

        const dueResult = await client.query(
            `SELECT SUM(amount) as total FROM payments
             WHERE tenant_id = $1 AND cattle_id = $2 AND (status = 'PENDING' OR status = 'OVERDUE')`,
            [tenantId, cattleId]
        );

        const totalAmountDue = dueResult.rows[0].total != null ? parseFloat(dueResult.rows[0].total) : 0;
        const amountPaid = amountPaidInput != null ? parseFloat(amountPaidInput) : totalAmountDue;
        const paidDate = new Date().toISOString().split('T')[0];

        if (totalAmountDue === 0 && amountPaid <= 0) {
            await client.query('ROLLBACK');
            return { ok: false, reason: 'NOTHING_DUE' };
        }

        if (totalAmountDue > 0) {
            await client.query(
                `UPDATE payments SET status = 'PAID', paid_date = $1, payment_method = 'Cash', updated_at = NOW()
                 WHERE tenant_id = $2 AND cattle_id = $3 AND (status = 'PENDING' OR status = 'OVERDUE')`,
                [paidDate, tenantId, cattleId]
            );
        }

        if (amountPaid > totalAmountDue && monthlyCharges > 0 && cattle.entry_date) {
            const overpayment = amountPaid - totalAmountDue;
            const extraMonths = Math.floor(overpayment / monthlyCharges);

            if (extraMonths > 0) {
                const existingRes = await client.query(
                    `SELECT COUNT(*) as count FROM payments WHERE tenant_id = $1 AND cattle_id = $2`,
                    [tenantId, cattleId]
                );
                const existingBillsCount = parseInt(existingRes.rows[0].count, 10);
                const entryDate = new Date(cattle.entry_date);

                for (let i = 0; i < extraMonths; i++) {
                    const nextDate = new Date(entryDate);
                    nextDate.setDate(nextDate.getDate() + ((existingBillsCount + i) * 30));

                    await client.query(
                        `INSERT INTO payments (tenant_id, cattle_id, amount, due_date, status, paid_date, payment_method, notes)
                         VALUES ($1, $2, $3, $4, 'PAID', $5, 'Cash', 'Advance Payment')`,
                        [tenantId, cattleId, monthlyCharges, nextDate.toISOString().split('T')[0], paidDate]
                    );
                }
            }
        }

        await client.query('COMMIT');
        return { ok: true, cattle, amountPaid, totalAmountDue };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { settleAllDueForAnimal };
