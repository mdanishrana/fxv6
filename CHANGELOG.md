# Changelog

All notable changes to FarmXpert (FX-V6) are documented here, newest first. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

This is the developer-facing record — see `FarmXpert_FXV6_Change_Tracking.xlsx` (outside the repo) for the same changes tracked in spreadsheet form.

## 2026-07-18

### Added
- **Billing & Payments**: reworked the billing cycle to be calendar-month aligned, anchored to each animal's registration date, with a prorated first invoice for a partial month. Added an automated monthly check (09:00 on the 2nd of every month) that emails the farm owner a report — HTML, PDF, and CSV — of everything due that cycle, with one-click "Payment Received" / "Still Pending" links that update status directly from the email, no login required (same single-use-token pattern as password reset / email verification). Whichever way the owner responds, the animal owner gets notified automatically, CC'ing the farm owner. See `BILLING_PAYMENTS_CHECKLIST.md`. (`server/jobs/billingProcessor.js`, `billingReportSender.js`, `billingScheduler.js`; `server/routes/paymentActions.js`; `components/PaymentActionResult.tsx`)
- **Feed Management**: automated nightly cron (`node-cron`, 00:15 daily) runs the same processing logic as the manual "Process Today's Feed" button, for every tenant — removes reliance on someone remembering to click it. Per-tenant error isolation; skips (not errors) tenants already processed or with no active animals. (`164c76a`)
- **Feed Management**: low-stock email/WhatsApp alerts now also fire immediately after processing pushes an item below threshold, not only when an item is manually edited. (`164c76a`)
- `FEED_MANAGEMENT_CHECKLIST.md` — tracks 6 best-practice recommendations for the module; 3 done, 3 backlog with reasons.
- 28 new backend tests across both features: roughage+concentrate deduction, price history persistence, feed cron skip/process/error-isolation, billing proration/idempotency/legacy-transition, single-use action token enforcement, billing cron per-tenant isolation.

### Fixed
- **Billing & Payments**: `cattle.js` had its own legacy invoice-generation hook firing on animal registration, using incompatible non-calendar-aligned math — it conflicted with the new generator and was removed.
- **Billing & Payments**: a silent off-by-one-day bug from reading `pg`-returned `date` columns via `.toISOString()` (which converts local-midnight `Date` objects to UTC, shifting the date backward in this server's +3 timezone) — was producing an extra invoice per animal. Fixed by always reading dates through their local getters.
- **Billing & Payments**: removed the `check-overdue` payments route — confirmed unused by the frontend, and its logic is now correctly subsumed by the new monthly generator, avoiding two overdue-marking implementations drifting apart.
- **Feed Management**: daily feed processing (`/process-daily`, `/process-multiple-days`) never deducted `ROUGHAGE` or `CONCENTRATE_FIXED` package items from inventory — only ratio-based `CONCENTRATE` items were ever subtracted, even though their cost was already counted correctly in every financial report. Extracted the correct per-animal consumption calc into a shared `computeAnimalFeedConsumption()`. (`52ecdc0`)
- **Feed Management**: `feed_items.price_history` was never an actual database column. Despite the frontend computing and sending a `priceHistory` array on every price change, the backend silently dropped it on every create/update — the "Market Price Trends" chart has likely never shown real data. Added the column and wired persistence. (`164c76a`)
- **Feed Management**: historical feed-cost backfill (`feedCostSync.js`) always priced backfilled days at *today's* rate. Now resolves the price actually in effect on each day from `price_history`. (`164c76a`)

## 2026-07-16

### Changed
- **Sidebar**: nav items and collapsible-section headers now use an icon-box treatment (active = emerald tint, inactive = slate) instead of bare icons. Sign Out changed from a permanently red-filled block to a quiet ghost style (red only on hover). Row spacing tightened. (`de5d440`)
- **Branding**: replaced the app logo everywhere (nav, footer, auth screen) with a properly cropped, best-fit asset — the source file had a huge transparent margin, previously forced a `scale-[2.4]` hack. Added a separate icon-only mark for the pedigree PDF print footer, since the new logo's white wordmark is invisible on a white printed page. (`2b7f032`)
- **Loading screen**: replaced the placeholder bouncing-cow SVG illustration with the real logo, animated with a pulsing glow ring and breathing scale. (`a06ac6b`)
- **Vaccinations**: KPI cards (Overdue Boosters / Due in 30 Days / Fully Protected) restyled to match the Dashboard's unified "Value & Operations" gradient hero-card look. First attempt used the wrong Dashboard card pattern; corrected same day. (`dfe813b`, `d0a6cfb`)

### Fixed
- **Mobile**: no global `overflow-x: hidden` on `html`/`body`, so decorative absolutely-positioned background blobs (landing page, auth hero) caused horizontal scroll/wobble on narrow viewports. Fixed with a single global CSS rule rather than patching each blob. (`ff6359f`)
- **Mobile / Performance**: `App.tsx` statically imported all ~22 authenticated-app page components, so the initial JS bundle was 2.6MB (628KB gzipped) regardless of route — pulling in `recharts`/`jspdf`/`html2canvas`/`xlsx` even for a landing-page-only visit. Converted every authenticated route to `React.lazy()` + `Suspense`; initial bundle now ~310KB (92KB gzipped). (`ff6359f`)
- **Mobile**: widened a few sub-30px tap targets on the auth screen (back link, sign-in/sign-up mode toggles). (`ff6359f`)
- **Infra**: a browser tab left open across a deploy could throw `Failed to fetch dynamically imported module` and go blank, since Vite content-hashes chunk filenames and the old bundle's `import()` calls reference filenames that no longer exist after a rebuild. Added a `vite:preloadError` handler that reloads once. Found while verifying the sidebar redesign on production. (`5e2e9a1`)

### Chore
- `dist/` was already fully untracked in practice (VPS rebuilds it on every deploy via `npm run build`); added to `.gitignore` to stop it showing as noise. (`ff6359f`)

## 2026-07-15

### Added
- **Vaccinations**: hover tooltip on the "Last Vaccine" column showing complete vaccination history (all doses + dates) per animal. (`368d8ec`)
- **Vaccinations**: individual animal-type filter (Cow/Bull/Heifer/Goat/Calf/Kid) replacing grouped Cattle/Small-Ruminant options. (`b773128`)
- Backend integration test suite: tenant isolation (16 tests across 8 previously-vulnerable routes), cattle CRUD, breeding calving/cascade logic.
- CI pipeline (typecheck, build, unit + integration tests on every push, dedicated Postgres 16 service container).
- Sentry error monitoring in production.

### Fixed
- **Vaccinations**: a real production bug — an animal already scheduled for a vaccine (e.g. FMD) could be scheduled again with no warning. Now blocks if already scheduled, and only allows a booster if the last completed dose of the same vaccine was 21+ days ago. Shared rule (`utils/vaccinationEligibility.ts`) used by both the single-animal and bulk-schedule flows. (`bb36bfa`)
- `ReferenceError: itemRes is not defined` in the medical-record endpoint. (`3151610`)
- **Security**: critical multi-tenant data isolation vulnerability — 8 route files trusted a client-supplied `x-tenant-id` header instead of the JWT-verified tenant ID; 6 of them required no authentication at all.
- **Security**: hardcoded JWT_SECRET fallback removed; server now fails fast without one set.

### Changed
- Health section reverted from a single tabbed page back to a collapsible sidebar submenu with 3 separate pages (Medical Inventory, Vaccinations, Protocols). (`ad2c4d1`)

## 2026-07-15 — Production cutover

- Full VPS rebuild and cutover to `app.mdrana.com`, with security hardening exceeding the prior server's posture: UFW firewall, fail2ban, separate DB/root passwords, random JWT secret, nginx upload limit fix, automated daily DB backups.
