# Feed Management — Best Practices Checklist

Tracking implementation of the 6 best-practice recommendations from the feed management review (2026-07-18). Each item notes status, what changed, and where.

## 1. Automate the routine, keep manual for exceptions
**Status:** ✅ Done

Nightly cron job posts feed consumption automatically for every tenant, instead of relying on someone remembering to click "Process Today's Feed." The manual button stays for on-demand visibility and catch-up.
- `server/jobs/dailyFeedProcessor.js` — the shared processing function, extracted so both the cron job and the manual API route call the exact same logic.
- `server/index.js` — schedules the job via `node-cron` at 00:15 local server time daily.
- Low-stock alert check now fires immediately after processing too, not just when someone manually edits an item.

## 2. Snapshot, don't recompute retroactively
**Status:** 🔲 Backlog — needs a scoping decision, not started

Both the multi-day feed catch-up and the historical feed-cost backfill (`feedCostSync.js`) apply *today's* animal weight/package to backdated days, rather than what was actually true on each day. Fixing this properly means tracking animal weight/package changes with effective date ranges (a real history table), which is a bigger schema change. Flagging for a separate conversation before starting — not blocking the other 5 items.

## 3. Reconcile theoretical vs. actual (stock reconciliation)
**Status:** 🔲 Not started

No way today to record a physical stock count and capture the variance (spillage/waste/theft) against theoretical consumption. Needs a small UI flow + an adjustment log. Scoping this next.

## 4. Track feed conversion ratio (FCR)
**Status:** ✅ Already existed — no work needed

`components/reports/FCRReport.tsx` already computes feed-consumed-per-kg-gained. Confirmed still correct after the roughage-deduction fix.

## 5. Forecast, don't just alert
**Status:** 🔲 Not started

Dashboard already computes estimated days-of-stock-remaining; the natural next step is turning that into a suggested reorder quantity/date rather than only a red low-stock badge. Scoping next.

## 6. Price at time of use, not time of query
**Status:** ✅ Done

Historical feed-cost backfill (`feedCostSync.js`) always used *today's* `cost_per_kg` for every backfilled day. While fixing this, found the actual root cause was worse than assumed: **`feed_items.price_history` was never a real column** — the `feed_items` table had no such column at all, so despite the frontend computing and sending a `priceHistory` array on every price change, the backend silently dropped it on every create/update. The "Market Price Trends" chart on the Inventory tab has likely never shown real data.

Fixed both parts:
- Added the missing `price_history jsonb` column to `feed_items` (local dev DB, `farmxpert_test`, and `database_schema.sql`; production still needs the same `ALTER TABLE` applied on deploy).
- `POST /api/feed/items` and `PUT /api/feed/items/:id` now actually persist `priceHistory`.
- `feedCostSync.js`'s backfill now resolves each backfilled day's price from that history (falling back to current `cost_per_kg` when there's no history yet, e.g. for existing items with no price changes logged since this fix).
