# Billing & Payments — New Cycle Logic

Tracking the billing/payments rework requested 2026-07-18: calendar-month billing anchored to registration date, an automated monthly check with a farm-owner report (PDF/CSV/HTML), one-click email status updates, and animal-owner notification on status change.

## What changed

1. **Billing starts from the animal's registration date, aligned to calendar months.**
   The first invoice covers `entry_date` through the end of that month, **prorated** (`monthly_charges x days_remaining / days_in_month`) unless registered on the 1st. Every invoice after that is a full calendar month (1st to last day), due on the 1st of the *following* month. `server/jobs/billingProcessor.js`.

2. **Automated monthly check, 09:00 on the 2nd of every month.**
   `server/jobs/billingScheduler.js` (node-cron) runs the same pipeline as the manual "Run Checks" button in Payment Manager (kept, per your call to keep both): generate any missing invoices, mark overdue, and - if anything is due - email the farm owner.

3. **Farm owner's monthly report: HTML + PDF + CSV, in one email.**
   Scoped to animals with a payment due this cycle (per your call). PDF/CSV built server-side (`server/utils/paymentReportGenerator.js`, new `pdfkit` dependency).

4. **Farm owner can mark Payment Received / Still Pending directly from the email, no login.**
   Each animal in the report gets a single-use, expiring token (`payment_action_tokens` table, `server/utils/paymentActionTokens.js`) - same pattern already used for password reset and email verification in this app. Clicking either link hits a public `GET /api/payment-actions` route and lands on a proper confirmation page (`components/PaymentActionResult.tsx`), not a bare browser alert.

5. **Status update -> animal owner notified, farm owner CC'd.**
   `sendPaymentStatusUpdateEmail()` fires from the same public route right after the click - "Received" sends a payment confirmation, "Still Pending" sends a reminder.

## Real bugs found and fixed along the way

- **`cattle.js` had its own legacy "Initial Billing Generation" hook** that fired on animal registration, using incompatible semantics (`due_date = entry_date`, no proration, no calendar alignment) - it was creating a conflicting invoice that fought with the new generator's "is this the animal's first invoice?" check. Removed; invoice generation is now exclusively the monthly check's job.
- **Silent date-off-by-one bug**: `node-postgres`'s default `date` type parser builds JS `Date` objects at *local* midnight, not UTC midnight. Reading that back via `.toISOString().split('T')[0]` (which converts to UTC first) silently shifted every date backward by one day in this server's timezone (GMT+3) - caught because it was producing an extra invoice per animal. Fixed by always reading pg-returned dates through their local getters (`pgDateToStr()` in `billingProcessor.js`) instead of `.toISOString()`.
- **Redundant, unused `check-overdue` route**: confirmed zero frontend callers, its overdue-marking logic now duplicated (correctly) inside the new generator. Removed rather than left to drift.

## Verified

- 13 new backend tests (`billingProcessor.test.js`, `billingIntegration.test.js`, `billingCronScheduler.test.js`): proration math, multi-month catch-up, idempotency, legacy-invoice transition, overdue marking, single-use token enforcement, cron per-tenant isolation.
- Manually verified end-to-end in the browser: registered an animal a month back, ran the check, confirmed 2 correctly-priced invoices (17 days overdue as expected), clicked both the "Received" and "Still Pending" email actions via their real tokens and confirmed the right one settles invoices and the other doesn't, confirmed a used token is rejected on replay.

## Known limitation, not addressed here

Advance/overpayment handling (paying multiple months at once) still uses the **old rolling-30-day math** for generating the extra PAID invoices (in `server/utils/paymentSettlement.js`, inherited from the original `/settle` endpoint) rather than the new calendar-month cycle. Low-priority - only affects animals whose owner pays several months in advance in one lump sum - flagging for a future pass rather than blocking this release.
