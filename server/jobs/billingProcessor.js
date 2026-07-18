const db = require('../db');

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// node-postgres's default `date` type parser builds JS Date objects at LOCAL
// midnight (not UTC midnight) for the stored calendar date. Reading that back
// via .toISOString() converts to UTC first, which silently shifts the date
// backward by a day in any positive-UTC-offset timezone. Always go through the
// Date object's own local getters (toDateStr) instead - never .toISOString()
// on a value that came from a pg `date` column.
function pgDateToStr(val) {
    if (val == null) return null;
    if (val instanceof Date) return toDateStr(val);
    return String(val).split('T')[0];
}

// Last calendar day of the month containing `d`.
function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// First calendar day of the month containing `d`.
function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

// First day of the month *after* the one containing `d`.
function startOfNextMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function daysInMonth(d) {
    return endOfMonth(d).getDate();
}

function daysBetweenInclusive(start, end) {
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Given an animal's entry date and its existing invoice history, returns the list of
 * calendar-month invoices that still need to be created, up through (and including)
 * the current month - never generates invoices for future months.
 *
 * Billing rules:
 * - The first invoice covers entry_date through the end of that calendar month,
 *   prorated (monthly_charges x days_remaining / days_in_month) unless entry_date
 *   is already the 1st, in which case it's a full month.
 * - Every invoice after that covers a full calendar month (1st to last day).
 * - Every invoice is due on the 1st of the month *after* the period it covers -
 *   e.g. the October invoice (Oct 1-31) is due November 1st, so the monthly check
 *   that runs on the 2nd can tell whether it was paid on time.
 * - Existing legacy invoices (created by the old rolling-30-day generator, before
 *   billing_period_start existed) are treated as "already billed through the month
 *   of their due date" - calendar-aligned generation picks up from the month after
 *   that, rather than rewriting old records.
 */
function computeMissingInvoices(entryDateStr, monthlyCharges, existingPayments, today) {
    const entryDate = new Date(entryDateStr + 'T00:00:00');
    const todayMonthStart = startOfMonth(today);
    const invoices = [];

    if (existingPayments.length === 0) {
        const periodStart = entryDate;
        const periodEnd = endOfMonth(entryDate);
        const isFirstOfMonth = entryDate.getDate() === 1;
        const amount = isFirstOfMonth
            ? monthlyCharges
            : Math.round((monthlyCharges * (daysBetweenInclusive(periodStart, periodEnd) / daysInMonth(entryDate))) * 100) / 100;

        invoices.push({
            billingPeriodStart: toDateStr(periodStart),
            billingPeriodEnd: toDateStr(periodEnd),
            amount,
            dueDate: toDateStr(startOfNextMonth(periodEnd)),
            notes: isFirstOfMonth ? 'Initial Registration Month' : 'Initial Registration Month (Prorated)'
        });

        if (periodEnd >= todayMonthStart) {
            return invoices;
        }
        existingPayments = invoices.map(i => ({ billing_period_end: i.billingPeriodEnd, due_date: i.dueDate }));
    }

    // Anchor: latest fully-billed calendar month-end we know about.
    const withPeriod = existingPayments.filter(p => p.billing_period_end);
    let anchorEnd;
    if (withPeriod.length > 0) {
        const latest = withPeriod.reduce((a, b) => (new Date(a.billing_period_end) > new Date(b.billing_period_end) ? a : b));
        anchorEnd = new Date(latest.billing_period_end + 'T00:00:00');
    } else {
        // All legacy rows (no billing_period_end) - anchor off the latest due_date's month.
        const latest = existingPayments.reduce((a, b) => (new Date(a.due_date) > new Date(b.due_date) ? a : b));
        anchorEnd = endOfMonth(new Date(latest.due_date + 'T00:00:00'));
    }

    let cursor = startOfNextMonth(anchorEnd);
    while (cursor <= todayMonthStart) {
        const periodEnd = endOfMonth(cursor);
        invoices.push({
            billingPeriodStart: toDateStr(cursor),
            billingPeriodEnd: toDateStr(periodEnd),
            amount: monthlyCharges,
            dueDate: toDateStr(startOfNextMonth(periodEnd)),
            notes: 'Monthly Billing Cycle'
        });
        cursor = startOfNextMonth(periodEnd);
    }

    return invoices;
}

/**
 * Generates any missing calendar-month invoices for every active, billable animal
 * in a tenant, then marks anything past its due date as OVERDUE. Idempotent - safe
 * to call multiple times for the same day/month.
 */
async function generateInvoicesForTenant(tenantId, today = new Date()) {
    const cattleResult = await db.query(
        `SELECT id, entry_date, monthly_charges FROM cattle
         WHERE tenant_id = $1 AND status = 'Active' AND monthly_charges > 0`,
        [tenantId]
    );

    let created = 0;
    const todayStr = toDateStr(today);

    for (const cattle of cattleResult.rows) {
        if (!cattle.entry_date) continue;
        const entryDateStr = pgDateToStr(cattle.entry_date);
        const monthlyCharges = parseFloat(cattle.monthly_charges);

        const existingRes = await db.query(
            `SELECT due_date, billing_period_start, billing_period_end FROM payments
             WHERE tenant_id = $1 AND cattle_id = $2 ORDER BY due_date`,
            [tenantId, cattle.id]
        );
        const existing = existingRes.rows.map(r => ({
            due_date: pgDateToStr(r.due_date),
            billing_period_start: pgDateToStr(r.billing_period_start),
            billing_period_end: pgDateToStr(r.billing_period_end)
        }));

        const missing = computeMissingInvoices(entryDateStr, monthlyCharges, existing, today);

        for (const inv of missing) {
            // Idempotency guard: never insert a duplicate for a period we've already billed.
            const dupe = await db.query(
                `SELECT id FROM payments WHERE tenant_id = $1 AND cattle_id = $2 AND billing_period_start = $3`,
                [tenantId, cattle.id, inv.billingPeriodStart]
            );
            if (dupe.rows.length > 0) continue;

            await db.query(
                `INSERT INTO payments (tenant_id, cattle_id, amount, due_date, status, notes, billing_period_start, billing_period_end)
                 VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7)`,
                [tenantId, cattle.id, inv.amount, inv.dueDate, inv.notes, inv.billingPeriodStart, inv.billingPeriodEnd]
            );
            created++;
        }
    }

    const overdueResult = await db.query(
        `UPDATE payments SET status = 'OVERDUE', updated_at = NOW()
         WHERE tenant_id = $1 AND status = 'PENDING' AND due_date < $2`,
        [tenantId, todayStr]
    );

    return { invoicesCreated: created, markedOverdue: overdueResult.rowCount };
}

module.exports = { computeMissingInvoices, generateInvoicesForTenant, startOfMonth, endOfMonth, toDateStr };
