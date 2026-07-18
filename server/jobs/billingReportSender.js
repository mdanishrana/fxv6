const db = require('../db');
const { generateInvoicesForTenant, startOfMonth } = require('./billingProcessor');
const { createReviewToken } = require('../utils/paymentReviewTokens');
const { generatePaymentReportCSV, generatePaymentReportPDF } = require('../utils/paymentReportGenerator');
const { sendMonthlyBillingReportEmail } = require('../services/emailService');

const APP_URL = () => process.env.APP_URL || 'http://localhost:5000';

/**
 * Runs the full monthly billing check for one tenant:
 *  1. Generates any missing calendar-month invoices and marks overdue ones (billingProcessor).
 *  2. Builds the "due this cycle" list (PENDING/OVERDUE animals).
 *  3. Mints one reusable review token for the whole cycle and emails the farm owner
 *     a report (HTML + PDF + CSV attachments) with a single "Review & Update Payments"
 *     link, so the owner can tick off several animals verified paid (e.g. from a bank
 *     statement) and confirm them all in one submission, rather than acting on one
 *     animal at a time.
 *
 * Returns { ok: false, reason: 'NO_TENANT'|'NO_OWNER_EMAIL' } or
 *         { ok: true, invoicesCreated, markedOverdue, dueCount, emailSent }
 */
async function runMonthlyBillingCheckForTenant(tenantId, today = new Date()) {
    const tenantRes = await db.query('SELECT id, name, owner_email, owner_name, currency FROM tenants WHERE id = $1', [tenantId]);
    if (tenantRes.rows.length === 0) return { ok: false, reason: 'NO_TENANT' };
    const tenant = tenantRes.rows[0];

    const { invoicesCreated, markedOverdue } = await generateInvoicesForTenant(tenantId, today);

    const dueRes = await db.query(
        `SELECT
            c.id as cattle_id, c.tag_number, c.owner_name, c.owner_email,
            SUM(p.amount) as total_due,
            MIN(p.due_date) as oldest_due_date,
            COUNT(p.id) as months_due,
            BOOL_OR(p.status = 'OVERDUE') as has_overdue
         FROM payments p
         JOIN cattle c ON p.cattle_id = c.id
         WHERE p.tenant_id = $1 AND p.status IN ('PENDING', 'OVERDUE') AND c.status = 'Active'
         GROUP BY c.id, c.tag_number, c.owner_name, c.owner_email
         ORDER BY c.tag_number`,
        [tenantId]
    );

    const dueAnimals = dueRes.rows;

    if (dueAnimals.length === 0) {
        return { ok: true, invoicesCreated, markedOverdue, dueCount: 0, emailSent: false };
    }

    if (!tenant.owner_email) {
        return { ok: false, reason: 'NO_OWNER_EMAIL', invoicesCreated, markedOverdue, dueCount: dueAnimals.length };
    }

    const rows = dueAnimals.map(a => ({
        tagNumber: a.tag_number,
        ownerName: a.owner_name,
        totalDue: parseFloat(a.total_due),
        monthsDue: parseInt(a.months_due, 10),
        status: a.has_overdue ? 'OVERDUE' : 'PENDING',
        oldestDueDate: a.oldest_due_date
    }));

    const reviewToken = await createReviewToken(tenantId);
    const reviewUrl = `${APP_URL()}/payment-review?token=${reviewToken}`;

    const cycleLabel = startOfMonth(today).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const currency = tenant.currency || 'PKR';

    const [pdfBuffer, csvText] = await Promise.all([
        generatePaymentReportPDF(rows, tenant, cycleLabel),
        Promise.resolve(generatePaymentReportCSV(rows, currency))
    ]);

    const attachments = [
        { filename: `billing-report-${cycleLabel.replace(' ', '-')}.pdf`, content: pdfBuffer },
        { filename: `billing-report-${cycleLabel.replace(' ', '-')}.csv`, content: csvText }
    ];

    const result = await sendMonthlyBillingReportEmail(
        tenant.owner_email, tenant.owner_name || 'Farm Owner', tenant.name, cycleLabel, rows, currency, attachments, reviewUrl
    );

    return { ok: true, invoicesCreated, markedOverdue, dueCount: dueAnimals.length, emailSent: !!result.success };
}

module.exports = { runMonthlyBillingCheckForTenant };
