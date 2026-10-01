# Implemented state

Last reviewed: 2026-09-11. Describes the working tree; it does not assert these
changes are deployed to production.

## Mobile hardening and stage 1.0.4 prep (2026-10-01 working tree)

- Employee outlet assignment: `assertAssignableOutlets` (services/employees.ts) validates ids are the organization's own ACTIVE outlets and the default is among them, before anything is written; ids are de-duplicated. `listEmployees` is deliberately **uncached** — `revalidateTag` only marks an `unstable_cache` entry stale, so the first read after a create/edit returned the old list to the mobile app.
- Invoice access: `assertCanReadOrderInvoice` (services/order-invoices.ts) is used by both invoice PDF routes; an employee may read only invoices for orders of an outlet they hold (owners see all; unknown codes fall through to the caller's own not-found; legacy-cancelled orders are checked too).
- Orders: idempotency lookup checks the outlet; status changes lock the order row, so concurrent updates cannot double-apply.
- Auth/API: `must_change_password` is enforced in api/handler.ts; public errors go through the whitelist in api/public-errors.ts; production throws if `SESSION_SECRET` is unset; password/session/throttle/token hardening with tests; dashboard rollup reconcile span capped at 92 days; `assertCalendarRange` in dates.ts.
- Dashboard: `GET /api/v1/dashboard` accepts `from`/`to`/`granularity`; the `cash` series is the month so far in up to 5 buckets (one bucket on the 1st — tests tolerate 1..5).
- `MOBILE_BLOCK_TERMS_NOT_SET` stays `false` (decided 2026-10-01). No migrations in this batch.
- Validation: `tsc --noEmit` clean; 118 integration tests on a disposable local Postgres via `scripts/test-subscription-payments.mjs` (needs `LC_ALL=C LANG=C`). Device passes used a local sandbox, never Neon.
- Open (not done): login throttle is per warm instance; session cookie id is a cuid; `billing_pending` not enforced server-side; idempotency unique keys are global rather than per tenant; expense update/delete and chosen paid date routes do not exist (mobile gaps E1–E3).

## Workspace notices and Super Admin self profile (2026-09-27 working tree)

- SessionStatusResult exposes server-derived trial dates/state; AdminProvider clears/reconciles this with the session and store context. Shared AdminChrome shows a quiet trial strip on every workspace page after session verification. The old page-level TrialBanner is removed; blocking access and paid-renewal notices are unchanged.
- WorkspaceNotice is shared by store/platform chrome for subscription status and dismissible information/maintenance announcements. Announcements are managed at /super-admin/announcements with drafts, publish/unpublish, store/platform/all audiences, optional organization targeting, information/warning tones and a safe optional link. The new workspace_announcements table requires the additive 20260927180000_workspace_announcements migration (currently pending on Neon). Server actions derive audience from the session; Super Admin writes are validated, revision checked and audited transactionally. Closing an announcement persists in sessionStorage per account/store/message revision across navigation and reload; trial status cannot be dismissed. Shell notices refresh on navigation/focus and every 60 seconds. See QA-ANNOUNCEMENTS.md for verification and pending live checks.
- /super-admin/profile exposes the signed-in Super Admin's name, login phone and optional email, with Profile navigation/avatar links and a separate Log out action. Server actions derive the user ID from requireSuperAdmin, never accept a target account ID, and do not edit memberships or privilege flags. Phone changes enforce uniqueness, increment credentialVersion and revoke sessions. Password change reuses changeUserPassword, verifies the current password and revokes all sessions.
- Validation: TypeScript and targeted ESLint pass; 86 disposable PostgreSQL integration tests pass (four new profile/security cases); isolated webpack production build passes. Authenticated desktop 1389px and mobile 375px checks cover the main owner/platform screens, with visual checks at 412px, mobile navigation, new-sale/outlet dialogs and profile editor. Owner account has empty lists; no live business/profile/password data was changed. See QA-WORKSPACE-NOTICES-PROFILE.md.
- No schema changes, dependencies, deployment or production mutations.

## Browser cache and sync (2026-09-27 working tree)

- Session display/routing mirrors use guarded localStorage reads/writes at `express-laundry-admin-v1-session`, with server-confirmed `storeId`. Every tab reconciles with the server; cached data is enabled only after verification. Storage logout/clear events remove client caches and invalidate pending requests. Store switching rechecks context. Mirrors never authorize server operations.
- Employee POS catalogue and enabled organization methods use five-minute store-scoped localStorage caches, optional Web Locks for cross-tab fetch serialization, storage updates, and online/focus refresh. `/api/v1/sync/status` provides uncached store-local maximum product/order update timestamps; catalogue version changes trigger refetch. POS drafts remain in sessionStorage.
- Owner Orders uses a 60-second display cache plus paginated delta refresh. Cancellation tombstones remove cached rows. Successful owner sale creation writes through without advancing the sync checkpoint. Employees retain SSR Orders without reading owner caches.
- Existing `/api/v1/orders/sync` accepts ISO timestamps and existing composite `(updatedAt, orderNumber)` cursors, default limit 100, maximum 500. Response retains `orders`/`nextCursor` and adds server `syncedAt`. Web clients drain all pages and checkpoint the first server request time, avoiding timestamp tie loss and device-clock gaps. Auth and outlet guards remain live; orders/expenses remain uncached on the server.
- Successful JSON GET products/payment-methods responses have standards-compliant weak ETags `W/"<hash>"`; authorized matching conditional requests return bodyless 304 responses with private cache/Vary headers. Auth failures stay no-store and never return 304.
- Manifest and static 192/512 PNG icons added, with standalone/Apple metadata. This supplies installation metadata; there is no service worker, offline navigation guarantee, or offline write queue.
- Validation: TypeScript/lint pass (two existing QA-script warnings), 78 disposable database integration tests and four client cache tests pass; isolated webpack production build passes. Live owner reload/Orders navigation and manifest link checked. Cross-tab logout tested via StorageEvents; live logout and employee POS were not exercised in the existing owner session. No new packages or schema changes. See CLIENT-CACHE-IMPLEMENTATION.md.

## Owner annotated UI fixes (2026-09-27 working tree)

- Owner New sale uses a session-scoped server action to search existing customer names by phone on Search/Enter, with pending, found/new and error states. No customer table or authentication change.
- Enabled organization payment methods precede Received now. COD uses its stable code and suppresses immediate collection. No enabled methods shows a Profile link and permits an unpaid sale; configuration is not changed automatically.
- Shared DateInput requests the native picker from any input click with a guarded fallback. Orders date fields no longer inherit the flex-column field wrapper class. Owner form focus uses one outline; Dialog initial focus does not rerun on parent callbacks.
- Employee outlet selections commit immediately with a top-right Clear; default outlet stays disabled until selected. Dialog title/body/footer have separate padding. Expense options share a responsive two-column row.
- Mark expense paid accepts an optional calendar date, defaults to today for existing callers, rejects invalid/future dates, and applies the expense rollup on that date. Repeat calls preserve the original paid date. Outlet trend reuses DashboardPeriodControl with separate chart range state.
- Validation: TypeScript and lint pass (two existing QA-script warnings); 75 isolated database integration tests pass. Live UI evidence and native-pointer verification limitation are recorded in QA-OWNER-UI-REPORT.md. No schema changes, new dependencies or live business-data mutations.

## Owner loading and list caching (2026-09-27 working tree)

- Client session readiness reuses Dashboard/Profile/Table skeletons by screen. Orders and Expenses route fallbacks share four 76px shimmer cards at widths <=768px and table skeletons above that breakpoint, in both workspace and nested boundaries.
- `listProducts` and `listEmployees` cache DTOs for 60 seconds; legacy `listStorePaymentMethods` caches for 120 seconds, with active/all variants keyed separately. Keys include store ID; tags include domain and store ID. Store-tag invalidation clears these three lists for that store.
- Owner actions and successful product/employee/legacy payment-method service writes immediately expire store tags with `revalidateTag(tag, { expire: 0 })`, including mobile API writes. Shared employee identity/outlet edits expire the employees domain tag. Organization payment-method reads and auth/session/order/expense/dashboard functions remain uncached.
- Focused mocked cache-boundary tests cover store isolation, payment visibility variants, TTLs, successful invalidation and failed-write cache retention. Run `node --conditions=react-server --experimental-test-module-mocks --import tsx --test tests/owner-data-cache.test.mjs`. All 74 existing database integration tests passed in disposable PostgreSQL; they stub the framework cache boundary.
- No dependencies, schema changes, shared-database mutations or deployment. Earlier QA fixes were preserved.

## Backend performance pass (2026-09-26 working tree)

- Added/deployed `20260926220000_add_perf_indexes` to the configured dev Neon database: `Store.deletedAt`, `Order.updatedAt`, composite `Order(storeId, phone, orderDate)`, `User.active`, and `User.isSuperAdmin`. SQL contains only index creation. Preflight confirmed all earlier migrations, including phone login, were already applied and only this index migration was pending.
- Session lookups and owner/member reads now project needed fields. Order lists omit the per-event user include, then batch unique actor names; list/detail history values and complete default result sets remain unchanged.
- `listStores` uses a 60-second `unstable_cache` entry tagged `stores`, invalidated immediately by contributing organization/subscription/plan/outlet/owner-identity mutations. Authorization/session/membership checks remain uncached.
- Products/payment-methods successful mobile GET responses now use `private, max-age=30`, with `Vary: Authorization, Cookie, X-Store-Id, X-Outlet-Id`; errors, writes, auth, orders, expenses, employees and other endpoints retain `private, no-store`. Client catalogue results can be reused for 30 seconds without a server request.
- Vercel project regions are pinned to `sin1`, matching the `ap-southeast-1` region encoded in both configured local Neon URLs; deployed production environment configuration was not inspected. Next.js explicitly externalizes the requested server packages, enables compression, and suppresses the powered-by header.
- Chose the requested throttle fallback: Map-based throttling remains confined to each warm instance; this does not provide shared cross-instance protection. No Redis dependency or login-attempts table was added.
- A silent default 200-order cap was not introduced because historical search and aggregate totals require complete data. Existing explicit limits remain honored; real web pagination remains future work.
- Verification: TypeScript, Prisma validation, isolated production build, diff hygiene, and all 74 existing integration tests pass. Lint has zero errors and two pre-existing warnings. A temporary disposable-database harness checks simulated cache-boundary hits/invalidation, catalogue cache headers, actor names, and complete 201-order results. Test files and seed are unchanged from the start of this performance request. No measured latency improvement is claimed.
- Exact old/new diffs and status for all ten requested items are in `PERFORMANCE-OPTIMIZATION.md` and `PERFORMANCE-OPTIMIZATION.patch`. No production deployment/migration was performed.

## Phone login replacement (2026-09-26 working tree)

- Platform admin, owner, and employee logins use a required personal phone number normalized to 8–15 digits by `src/lib/contactValidation.ts`. `User.username` is removed; `User.phone` is unique. Organization/outlet contact phones remain separate.
- Web login and mobile `/api/v1/auth/login` accept phone/password. Mobile login/status return `user.phone`; session DTOs, user/employee management, onboarding, owner lookup, profile login display, and activity actor display use phone. Existing-owner lookup is an exact normalized personal-phone match, excluding platform admins.
- Employee and platform-user phone changes bump `credentialVersion` and revoke sessions. Formatting-only edits preserve credentials. Password hashing, token/cookie structure, role rules, and order/payment logic are preserved.
- Seed configuration requires `SEED_OWNER_PHONE` alongside existing password/name settings. Auxiliary QA lookups use `QA_OWNER_PHONE` / `QA_EMPLOYEE_PHONE`.
- **At phone-login implementation time, not applied to the shared database (dev history was subsequently confirmed applied during the performance preflight):** migration `20260926210000_use_phone_as_login_identifier` is prepared and verified in disposable local PostgreSQL. It transactionally checks missing/invalid/duplicate normalized personal phones, normalizes valid values, adds required/unique constraints, and drops username. It stops without data loss when reconciliation is needed. Backfill verified personal phones and resolve collisions before applying; no invented numbers, truncation, or reseeding was performed. Production reconciliation remains a deployment prerequisite.
- Verification: TypeScript and Prisma validation pass; lint has zero errors and two pre-existing unused-variable warnings in `scripts/qa_audit.mjs`; The production build passes in an isolated temporary copy (the existing dev server remains running). 74 integration tests pass, covering phone login/status, normalization, throttle equivalence, duplicate rejection, employee/platform phone session invalidation, exact owner lookup, migration failure rollback, and existing operational flows. Authenticated browser verification awaits database reconciliation/migration.

## Multi-outlet rollout: Tasks B1–B6 completed and verified

The approved organization → outlet rollout is tracked task-by-task in
[`MULTI-OUTLET-RUNBOOK.md`](MULTI-OUTLET-RUNBOOK.md). Tasks B1 through B6 are
fully implemented and verified:
- **B1**: Additive schema foundation (`Outlet`, `OutletMembership`, `PlatformPaymentMethod`, `OrganizationPaymentMethod`, `AuditLog`, `Subscription.trialEndsAt`).
- **B2**: Auth, login context, and organization/outlet authorization (`requireOutletSession`, `resolveAllowedOutlets`, single active organization rule for employees).
- **B3**: Operational ownership (`outletId` on `Order`, `Payment`, `Expense`, `RecurringExpenseSeries`, `OrderInvoice`, `StatusEvent`).
- **B4**: Global payment catalogue and organization enablement (`PlatformPaymentMethod`, `OrganizationPaymentMethod`, checkout validation).
- **B5**: Organization trial/subscription restriction (`assertStoreWritable`, `allowRestricted` read access, expiring subscription queries).
- **B6**: Daily outlet summaries (`DailyOutletSummary`) and service sales breakdown (`DailyOutletServiceSummary`), transactional incremental updates on order creation, status completion, payments, and expenses, idempotent retries, query APIs, and audited protected reconciliation (`reconcileDailyOutletRollups`).

Independent verification (`npm run test:subscription-payments` against a disposable local Postgres cluster) found and fixed two regressions before signing off B1–B6:
- B4's stricter outlet-payment rule (legacy `StorePaymentMethod` cannot pay outlet-owned orders) was correct by design (see test `B4.4`), but the B3 test fixtures predated it and never created/enabled a `PlatformPaymentMethod`, so every outlet order in `tests/outlet-operational.integration.test.ts` failed with "That payment method is no longer available." Fixed by adding the missing platform-method setup to that fixture — this is a real operational requirement, not just a test gap: **any organization must have a super-admin-created and owner-enabled platform payment method before its outlets can take any payment.**
- `getStoreAccessStatus` reused `PAYMENT_WARNING_DAYS` (30 days) for the trial-ending banner threshold, which contradicted `subscription-restrictions.integration.test.ts`'s expectation that a trial 14 days from expiry still reads `TRIAL`. Added a separate `TRIAL_WARNING_DAYS = 7` constant in `src/server/auth/session.ts`.

All 37 integration tests pass, `tsc --noEmit` and `eslint .` are clean. Task B7 (staging reset) is blocked awaiting explicit user approval. W1 and W2 are done and browser-verified end-to-end against staging (see below); M1/M2 are deferred per user direction.

## Multi-outlet W2: Next.js owner/employee outlet-aware screens implemented

- `OutletSwitcher` wired into `AdminChrome`'s topbar for both owner and employee. Owner sees every active outlet plus an "All outlets" option (Dashboard only); employee sees only their granted, active outlets and no "All outlets" option.
- Dashboard, Orders, and Expenses read `resolveOutletSelection` and filter `listOrders`/`listExpenses` by the selected outlet; Dashboard additionally supports the all-outlets aggregate via `outletId: undefined`.
  - **Correction (2026-09-22, QA fix round):** no longer true in the working tree. Only the Dashboard page (`src/app/(workspace)/page.tsx`) calls `resolveOutletSelection`; the Sales, Orders and Expenses pages list the whole store with no outlet filtering. Probably lost when those pages were rewritten for Owner Workspace 2.0. See `.agents/css-refactor/qa/FIX-REPORT.md`.
  - **Correction (2026-09-22, M0 data correctness):** Dashboard (`src/app/(workspace)/page.tsx`) queries `listOrders` and `listExpenses` with `targetOutletId = allOutletsSelected ? undefined : selection.outletId`. When all outlets are selected, `targetOutletId` is `undefined`, querying the full store so all outlets and org-wide orders aggregate into Dashboard totals and recent orders. Single-outlet selection continues to query `{ outletId }`.
- New: owner-facing employee outlet assignment on `/admin/employees` — a per-employee "Outlets (N)" disclosure lists every active outlet with a checkbox (grant/revoke via `setEmployeeOutletAccessAction`) and a "Make default" action (`setEmployeeDefaultOutletAction`), calling the existing `assignEmployeeToOutlet`/`assignDefaultOutlet`/new `removeEmployeeFromOutlet` service functions. Hidden entirely for stores with zero outlets.
- Payment methods and subscription/trial banners (`AccessNotices.tsx`, `PaymentMethodsSettings.tsx`) already reflected the B4/B5 backend contract from Gemini's earlier pass; verified working live.

**Staging migrations applied**: the 4 pending B1–B6 migrations had never been deployed to the actual staging Neon database (only to the disposable local test cluster) — `npx prisma migrate deploy` was run against staging with explicit user approval. All additive, zero destructive operations.

**Live browser walkthrough** (super admin → owner → employee) against staging, end to end:
1. Super admin onboarded a new organization "One Wash Laundry", created outlets `OBLRCHN01` (Chinnapanahalli) and `OBLRMTH01` (Marathahalli), and created the global "Cash" platform payment method.
2. Owner logged in, saw "All outlets" by default on Dashboard, enabled "Cash" for the organization, added a service ("Wash & Fold", org-wide catalogue confirmed), created an employee, and granted that employee both outlets with Chinnapanahalli as default via the new Outlets disclosure.
3. Employee logged in, defaulted to their designated outlet, switched to Marathahalli via the switcher, and punched a real order with Cash payment (order `EL-73`) — this exercised the exact `resolveActivePaymentMethod`/outlet-ownership code path fixed above, confirming the fix is correct in the live app, not just in tests.
4. Outlet isolation confirmed: the Marathahalli order is invisible when the (single-outlet) Orders view is scoped to Chinnapanahalli, and correctly aggregates into the owner's "All outlets" Dashboard (₹100, 1 order).
5. Authorization confirmed: the employee was redirected away when navigating directly to the owner-only `/admin/employees` route.

**Gaps found during the walkthrough (not yet fixed):**
- The "All outlets" option only appears on the Dashboard screen (`showAllOutletsOption={screen === 'dashboard' && role === 'owner'}` in `AdminChrome.tsx`). Orders and Expenses restrict the owner to one outlet at a time, which is narrower than the original brief ("Outlet filter across Dashboard, Orders/Sales, Expenses, Staff, and reporting").
- The selected-outlet cookie (`el_selected_outlet`) is not reset on login/logout, so a fresh owner login can inherit the last-viewed outlet from a different user's session in the same browser instead of defaulting to "All outlets". Not a security issue (server-side authorization is always re-checked against the current session's memberships), but a UX inconsistency worth fixing.

## Multi-outlet W1: Super Admin controls implemented

- Store (organization) detail now has an **Outlets** tab at
  `/super-admin/stores/[storeId]/outlets`. Super Admin can create an outlet
  using its globally unique, immutable manually assigned code, display name,
  address, and phone. The page shows existing outlet codes and lifecycle status.
- `/super-admin/payment-methods` manages the global payment catalogue. Super
  Admin can create methods, rename their display name without changing the
  immutable code, and activate/deactivate a method. Store owners configure
  organization-wide enablement separately; no outlet-specific payment setting
  or QR credential is introduced.
- W1 uses server actions that repeat Super Admin authorization and revalidate
  affected pages; it does not add migrations, reset data, or change subscription
  billing decisions. Verified with TypeScript, ESLint, and a production build.

## Multi-tenant foundation (StoreOps): schema, auth and Super Admin UI built

The app is being turned into a multi-tenant platform — see the StoreOps product
spec (published as an artifact this session) for the full plan. Done so far:

- **Schema**: `Store`, `Subscription`, `SubscriptionPayment`, `StoreMembership`
  added; every tenant-scoped table (`Product`, `Order`, `Expense`,
  `RecurringExpenseSeries`) now carries a required `storeId`. `User.role` was
  removed — role is now per-store via `StoreMembership.role`; `User.isSuperAdmin`
  is a new platform-level flag, unscoped to any store. The old single-row
  `StoreProfile` table is gone, absorbed into `Store`.
- **Migration**: the existing Chinnappanahalli store and all its data (products,
  orders, expenses, all 4 users) were migrated in as the first real tenant
  (`store-express-laundry-01`), preserving every user's prior role as a
  `StoreMembership` row. Verified in the browser post-migration: login, every
  screen's data, and a fresh order/employee/profile write all round-trip
  correctly against the new schema.
- **Session model**: `requireSession()` was replaced by `requireStoreSession()`
  (resolves the caller's role for a specific store — currently falls back to
  "the user's only membership" since no store switcher exists yet) and
  `requireSuperAdmin()`. Every existing service/action/page was rewired to
  this — see `src/server/auth/session.ts`.
- **Super Admin UI**: built and verified. `/login` (canonical for platform admins, owners, and employees;
  `/super-admin/login` redirects here), `/super-admin` (dashboard:
  store counts, needs-attention list), `/super-admin/stores` (directory + a
  real 4-step onboarding wizard — store details, new-or-existing owner,
  plan selection, review). Onboarding transactionally creates the `Store`,
  `Subscription`, owner `User`+`StoreMembership`, and enabled organization
  entries for all currently active platform payment methods. The wizard does
  not mark payments received; these are recorded from the Subscription tab.
  Organization contact phone and a separate new-owner phone are required.
  Existing owner contact details are preserved. Historical onboarding browser
  verification predates the 2026-09-26 feedback changes.
- Auth for this area is intentionally simpler than the store app's: Super
  Admin pages are plain Server Components calling `requireSuperAdmin()`
  directly (redirecting to `/super-admin/login` on failure) — no client-side
  session mirror/Context, since there's no multi-role-per-screen complexity to
  manage the way the store app has.
- **Store Detail, edit, lock/unlock enforcement, delete (Stores S1–S5): built
  and verified.** `/super-admin/stores/[storeId]` (Overview tab with real
  data; Users tab shows real store members via `listStoreMembers()`;
  Subscription/Activity still ship as stubs pending their own work) plus
  `/subscription`, `/activity`, `/edit` routes — see `StoreDetailShell.tsx`.
  Edit (`updateStore()`) works from both a quick row dialog and the full
  `/edit` page. `setStoreStatus()` + `requireStoreSession()` now actually
  enforce `Store.status === 'LOCKED'` (previously stored and displayed but
  never checked at auth time) — verified in the browser: a locked store's
  owner can still log in but every screen returns empty/blank data, confirmed
  by toggling lock/unlock and doing fresh logins in each state, not just
  checking the admin UI's badge. Delete is soft — a new `Store.deletedAt`
  column (migration `20260908141738_store_soft_delete`); `archiveStore()`
  requires the caller to type the exact store name, checked server-side, and
  `requireStoreSession()` blocks archived stores the same way as locked ones.
  Order/payment/subscription history is preserved, not destroyed. No
  restore/un-archive UI exists yet.
- **Platform Users (F1–F7): built and verified.** `/super-admin/users`
  (cross-store directory, separate from the existing per-store
  `/admin/employees`) + `/super-admin/users/[userId]` (one combined
  profile/store-access/security page, no tabs). New
  `src/server/services/platform-users.ts` — `createUser()`/`updateUser()`
  manage at most one `StoreMembership` per user from this screen (a second
  store is assigned from that other store's own flow, confirmed deliberate,
  not a limitation); `resetUserPassword()` and `setUserActive()` both reuse
  `revokeAllSessionsForUser()`. Verified in the browser with two isolated
  tabs (two real concurrent sessions) that deactivating a user genuinely
  revokes their session server-side (`Session` rows deleted) — their *next*
  request is rejected, not their current screen instantly torn down (a tab
  already rendering when deactivation happens keeps showing stale content
  until it next fetches or navigates; the store workspace's own client-side
  session mirror doesn't currently get pushed a signal either — see the
  "known gaps" note below). Deactivate/reactivate each show a plain
  Cancel/Deactivate (or Reactivate) confirmation dialog
  (`DeactivateUserDialog`) — no typed name/text confirmation, unlike Delete
  store's typed-name gate. Reset password supports auto-generate (shown
  once) or manual, both via `ResetPasswordDialog`.
- **Subscriptions & plans (P1–P10): built and verified.** Migration
  `20260908150349_subscription_plans` added `SubscriptionPlan` (name,
  deposit, annual fee, notes, `archivedAt` soft-archive), `Subscription.planId`
  (nullable — a subscription can still be fully custom with no plan) and
  `.discountAmount`, `SubscriptionPayment.method`, and migrated
  `Payment.method` (order payments) from free-text to a shared
  `PaymentMethod` enum (`CASH`/`UPI` only — verified the one pre-existing
  value in production data was `UPI`, then hand-edited the generated
  migration to `ALTER COLUMN ... USING` cast rather than drop-and-recreate,
  since Prisma's default diff for that column would have been destructive).
  This also meant narrowing the existing Sales/Orders payment-method
  dropdowns from four free-text options (UPI/Cash/Card/Other) down to the
  same two, sharing one `PAYMENT_METHODS` constant
  (`src/features/admin/admin.data.ts`) between the store app and Super Admin.
  New `src/server/services/subscription-plans.ts` (`listPlans`, `getPlan`,
  `createPlan`, `updatePlan`, `archivePlan` — archiving a plan with stores
  still on it requires the caller to explicitly reassign them to another plan
  or detach them to custom terms, both handled in one transaction;
  `changeStorePlan`, which deliberately leaves `paidThroughDate` untouched —
  a plan change applies at the next renewal, confirmed product decision, not
  proration). `stores.ts` gained `recordSubscriptionPayment()` (renewal
  payments extend `paidThroughDate` by one year from whichever is later,
  today or the current paid-through date, so renewing early never shortens
  the term) and `listStoreInvoices()`/`getInvoice()`. Routes:
  `/super-admin/subscriptions` (plan library) and `/super-admin/subscriptions/billing`
  share a `SubscriptionsShell` tab bar; `/super-admin/subscriptions/[planId]`
  and `/super-admin/subscriptions/invoices/[invoiceSeq]` are detail pages.
  Recording a renewal payment is reachable from both Store Detail's
  Subscription tab and the billing table's row action (confirmed both are
  wanted, not a duplicate) — same `RecordPaymentDialog` component either way.
  `OnboardingWizard.tsx` now offers only plan selection, with an optional
  discount and deposit waiver override. Custom subscription terms remain
  supported by the service for existing callers; the wizard records payment later.
  **QA-01 concurrency fix verified (2026-09-08):** subscription payment
  recording now locks the `subscriptions` row with `SELECT ... FOR UPDATE`
  inside its transaction **before** reading `paidThroughDate`. Concurrent
  renewals therefore grant consecutive terms; the date update and invoice
  creation commit or roll back together. A real PostgreSQL regression runs
  the actual service using Prisma's PostgreSQL test adapter against a fresh,
  Unix-socket-only local cluster with the repository migrations applied.
  Both calls are held at a database lock barrier to make the race repeatable:
  before the fix, two invoices covered 2100-03-01–2101-03-01 and expiry
  advanced only once; after it, they cover consecutive terms ending
  2102-03-01. All four integration cases pass (concurrent renewals, deposit
  behavior, missing subscription, invoice-failure rollback). Run
  `npm run test:subscription-payments`; local `initdb`, `pg_ctl`, and `psql`
  must be on PATH. The runner does not load `.env` or use Neon; it stops and
  removes its temporary cluster afterward. This fixes serialization of
  distinct payments, **not payment retry idempotency**. Renewal/onboarding
  term math now adds exactly one calendar year (`addYears()` in
  `stores.ts`, with a Feb 29 → Feb 28 fallback in a non-leap target year)
  instead of a fixed 365 days — the earlier +365-day arithmetic lost a day
  against an anniversary-based renewal across a leap year (QA-09, fixed).
- **Invoice PDF: built and verified (2026-09-09).** `@react-pdf/renderer`
  (pure JS, no headless-browser dependency — chosen over Puppeteer/Playwright
  given this app hasn't picked a deployment target yet and a Chromium
  dependency is a heavier, more fragile fit for an undetermined host).
  `src/features/super-admin/pdf/InvoicePdf.tsx` defines the PDF layout;
  `src/app/super-admin/subscriptions/invoices/[invoiceSeq]/pdf/route.tsx`
  (Node runtime — `@react-pdf/renderer` needs it, not edge) renders it on
  request, gated by `requireSuperAdmin()` same as the HTML invoice page
  (verified: an unauthenticated `fetch` gets 401, not a PDF). `?download=1`
  switches `Content-Disposition` from `inline` (View PDF) to `attachment`
  (Download PDF). `InvoiceActions.tsx` adds Print/View/Share/Share via
  WhatsApp/Download buttons to the invoice detail page. Print uses
  `window.print()` plus a `@media print` block in `super-admin.css` that
  hides the sidebar/topbar/actions (`.side`, `.top`, `.no-print`) so the
  browser's print/Save-as-PDF output is just the invoice. View PDF opens
  `InvoicePdfViewer.tsx` — an in-app `Panel` (the same slide-over used
  elsewhere, e.g. `RecordPaymentDialog`) with an `<iframe>` rendering the PDF
  inline, plus its own Open-in-new-tab/Download buttons — added after the
  first pass linked straight to the raw PDF route, which dropped the user
  into the bare browser PDF viewer with none of the app's own chrome around
  it. Share (2026-09-09) uses the Web Share API: shares the actual PDF file
  via `navigator.share({files})` where supported (mobile Safari/Chrome —
  hands off to WhatsApp/Mail/Messages/AirDrop/etc.), falls back to sharing
  just the link (`navigator.share({url})`), then to copying the link to the
  clipboard, then to just displaying the link in a toast — deliberately no
  server-side email sending, decided against per-invoice rather than
  guessed: a real "email the owner" feature needs an email provider (Resend/
  SendGrid/SMTP/etc.) that isn't wired into this app anywhere, and picking
  one is a product decision, not something to build silently. Share via
  WhatsApp (2026-09-09, 2026-09 brainstorm Item 6) adds an explicit,
  guaranteed WhatsApp path alongside the generic Share button, since
  `navigator.share` doesn't exist at all on many desktop browsers (desktop
  Firefox, some desktop Chrome contexts) — it opens a `wa.me/?text=...` link
  in a new tab, prefilled with "Invoice #&lt;n&gt;" plus the invoice's
  absolute view-PDF URL; this is deliberately link-only (a `wa.me` URL
  scheme cannot carry file bytes, only text) and works identically on
  desktop (opens WhatsApp Web, if logged in) and mobile (hands off to the
  native app) with no platform detection. The PDF intentionally shows only
  fields the data model actually has (amount, method, dates, notes) — no
  GST/tax line, since the Subscription/Store schema has no tax fields at
  all; do not add one to the PDF without adding real schema support first.
- **Subscriptions design-parity pass (2026-09-09)**, against a direct
  comparison of the P1–P10 design canvas source (not screenshots — the
  canvas's own `.dc.html` per-screen text was pulled and diffed field-by-field
  against the running code). Migration `20260909042705_add_deposit_waived_by_default`
  added `SubscriptionPlan.depositWaivedByDefault` — the plan's own
  `depositAmount` stays on file as the "charge anyway" figure, not a second
  number. New/changed:
  - **P1** row menu gained Edit/Duplicate/Delete (`duplicatePlan()`/
    `deletePlan()` in `subscription-plans.ts` — delete only reachable at zero
    stores attached, hard `prisma.subscriptionPlan.delete()`, safe precisely
    because nothing references it); the Billing cycle column now reads
    `plan.billingCycle` instead of a hardcoded "Yearly" string (still only one
    enum value exists, so no visible change yet, just no longer disconnected
    from the field).
  - **P2** billing table gained a "Last invoice" column (`listStores()` now
    does one `findMany` over `SubscriptionPayment` ordered by `paidAt desc`,
    first-seen-per-store in JS — not a `groupBy`, since independent
    per-column `max()` can't guarantee `invoiceSeq` and `paidAt` come from
    the same row) and a client-side CSV Export button. Still not built:
    "Collected this year" (needs a real fiscal-year definition and an
    aggregate-payments query — a product decision, not guessed), pagination,
    and the fiscal-year filter — all skipped as genuinely bigger scope than
    this pass, not oversights.
  - **P3** invoice detail gained a "Subscription" summary card (term,
    paid-through, jump link) alongside the existing notes card. Still not
    built: GST/tax breakdown, payment reference/recorded-by (neither field
    exists on `SubscriptionPayment`), an Activity timeline (no audit-trail
    infrastructure for invoices at all), owner email/phone (the `User` model
    has neither column). "Send to owner" remains the Share-sheet button
    (see above), not real email — a deliberate, discussed deviation from the
    design's literal spec, not an oversight.
  - **P4** `PlansEmptyState.tsx` rebuilt with the explainer copy, a real
    "Create your first plan" CTA, and two example plan-card previews. The
    design's second "Keep setting terms manually" button was deliberately
    *not* built as a button — it has no action to attach (nothing to save),
    so it's descriptive prose in the intro paragraph instead of a dead click.
  - **P5** plan detail gained a Duplicate button, "Created &lt;date&gt;"
    (already had `createdAt` in the schema, just never surfaced), the
    deposit-waived-by-default row, and a "Last used" stat (max of attached
    stores' `onboardedAt`). Still not built: "Change history" (no audit
    trail). The "Deposits held"/"Annual revenue" figures are still nominal/
    configured numbers, not real received cash, and "Annual revenue" still
    ignores per-store fee overrides — flagged, not fixed, in an earlier pass
    too; needs a product decision on what these should actually mean before
    changing the calculation.
  - **P6** `PlanEditor.tsx` gained the "Deposit waived by default" checkbox
    and a Billing-cycle field — rendered as a disabled single-option select
    (`ANNUAL` → "Yearly") since the schema enum only has one value; a real
    selector with nothing to select would be worse than an honest disabled
    one.
  - **P7** `PlanArchiveDialog.tsx` now fetches and lists the actual affected
    store names/owners (`listPlanStoresAction` → `listPlanStores()`) instead
    of just a count, and offers "Delete plan instead" inline when zero stores
    are attached.
  - **P8** `ChangePlanDialog.tsx` replaced the plan `<select>` with the new
    shared `PlanPickerCards.tsx` (a real `<label>`+radio-input pair per card,
    not a clickable `<div>` — keyboard/AT accessible by construction) and
    added a "Reason" field (appended to `Subscription.notes` with a dated
    marker, no new column). The dialog originally also showed an "Effective
    from" pair ("Next renewal" vs. a disabled "Immediately, recalculating the
    current term's balance" needing proration logic that didn't exist) — this
    was removed entirely in the 2026-09 brainstorm's Item 4 (confirmed product
    decision: plans never change mid-term in real usage, only renew early,
    which the existing renewal-payment logic in `stores.ts` already handles
    correctly by extending from whichever is later, today or the current
    `paidThroughDate`). "Change plan" is now purely an update to the terms on
    file going forward, with zero effect on `paidThroughDate` and no
    user-facing timing choice; the help text under the form states this
    plainly. `subscription-plans.ts`'s `ChangeStorePlanInput`/
    `changeStorePlanSchema` never had an "effective from" field to begin with
    (the old UI choice was cosmetic only), so no server-side change was
    needed.
  - **P9** (`OnboardingWizard.tsx`'s Plan step) also switched to
    `PlanPickerCards`; added a "charge a deposit anyway" toggle (visible only
    when the selected plan has `depositWaivedByDefault`, using the plan's own
    `depositAmount` as the override figure — `stores.ts`'s `onboardSchema`
    gained `chargeDepositAnyway` on the plan-mode branch); a contextual hint
    when onboarding a 2nd+ store for an existing owner; an inline "+ Create a
    new plan" (opens a nested `Panel`+`PlanEditor`, appends to the wizard's
    own local `plans` state so it's selectable immediately, no page reload);
    a live running-total block during entry, not just at review; and the
    payment-received checkbox is now replaced by "Nothing due today" static
    text when the computed total is genuinely zero, instead of asking to
    confirm receipt of nothing.
  - **P10** (Review step) gained per-section "Edit ↦ jump to that step"
    links (real jumps via `setStep(index)`, not sequential Back), a "What
    happens when you confirm" preview block, and an existing-owner note
    ("Signs in with their existing account — no new password needed").
    Still not built, and treated as infeasible-as-specified rather than
    missing: pre-announcing the invoice number before creation — it's a
    Postgres autoincrement, so there is no number to show without adding a
    reservation step, which wasn't asked for.
- **Per-store employee access + payment-lapse enforcement (2026-09-brainstorm
  Items 1 + 3): built and verified.** These share `requireStoreSession()`
  and were built together per the plan file's own sequencing.
  - **Schema**: migration `20260909091715_membership_active_and_payment_lapse`
    added `StoreMembership.active Boolean @default(true)` — access is now a
    per-store flag, not the global `User.active` it was before. `User.active`
    still exists and still gates login entirely (used by Super Admin's own
    platform-wide deactivate/reactivate in `platform-users.ts`, intentionally
    unchanged — that's a genuinely different, platform-level concept from a
    store owner deactivating their own staff).
  - **`src/server/auth/session.ts`**: `onlyMembership()`'s "refuse to resolve
    a session for anyone with more than one `StoreMembership`" block is gone
    — replaced by `onlyActiveMembership()`, which filters to `active: true`
    first. A person can now hold a stale inactive membership at an old store
    and an active one at a new store on the same login without either
    membership count blocking the other. `requireStoreSession()` now also
    denies access live (no stored/cached lock) for four distinguishable
    reasons, carried as `AuthError.reason` (`AccessDeniedReason`):
    `membership_inactive`, `store_locked`, `store_archived`, and
    `payment_lapsed` (computed the same way `paymentStateFor()` in
    `stores.ts` already did — an explicit past `paidThroughDate`; a never-set
    subscription is never auto-locked). None of these touch the `Session`
    table, so access at a *different* store the same person belongs to is
    unaffected, and access resumes automatically the instant the underlying
    condition clears (membership reactivated, store unlocked, renewal
    payment recorded) — no unlock step exists for any of them. A new
    `getStoreAccessStatus()` (non-throwing sibling of `requireStoreSession`)
    and `PAYMENT_WARNING_DAYS` (7) back the UI's banner/blocking-screen
    state. `src/server/dates.ts` gained a shared `addDays()` (previously a
    private helper duplicated only in `stores.ts`) for the warning-window math.
  - **`src/server/services/employees.ts`**: an owner deactivating their own
    staff (`toggleEmployeeActive`, `updateEmployee`'s `active` field) now
    flips `StoreMembership.active` for that store only — it no longer
    touches `User.active`, `credentialVersion`, or calls
    `revokeAllSessionsForUser()` for this. Username/password changes still
    bump `credentialVersion` and revoke sessions globally (correct: it's the
    same login everywhere). `createEmployee` always creates the `User` row
    active; the form's "active" checkbox now seeds the membership's flag.
  - **`src/server/services/platform-users.ts`**: `listStoreMembers()` (Store
    Detail's Users tab) now reads `active` from the membership row, not
    `user.active`, to stay accurate now that the two can differ.
    `setUserActive()`/`resetUserPassword()` (Super Admin's own actions) were
    deliberately left untouched — global by design.
  - **Store workspace UI**: `getSessionStatusAction()`
    (`src/server/auth/actions.ts`) now surfaces `blockedReason`,
    `paidThroughDate` (only when the reason is `payment_lapsed`, for the
    owner-facing exact-date message), and `paymentWarning` (non-blocked,
    within the 7-day window). `AdminProvider.tsx` mirrors these into context.
    New `src/features/admin/components/AccessNotices.tsx`: `AccessBlockedScreen`
    replaces the normal screen content entirely (inside `AdminShell`, so
    nav/logout stay reachable) for any of the four reasons, with owner- vs.
    employee-specific copy — a payment lapse tells the owner the exact
    expiry date and that access resumes automatically on renewal; an
    employee gets "please check with your store owner", no figures.
    `PaymentWarningBanner` is the non-blocking 7-day-out banner, same
    owner/employee copy split. `AdminScreenContainer.tsx` renders the
    blocked screen in place of every dashboard/sales/orders/etc. screen when
    blocked (previously a locked store rendered its own now-empty
    server-fetched data next to a small banner; that pattern is retained for
    the *mechanism* — data is still withheld server-side, nothing new was
    added to hide it — but the UI now shows one clear blocking message
    instead). The logout confirmation dialog (and the notice/error toasts)
    were pulled outside the blocked/unblocked branch so logout still works
    from the blocking screen (a bug caught during this pass' own browser
    verification, fixed before landing).
  - **Verified in the browser**: created isolated test stores/users
    (cleaned up after) covering all four scenarios — (a) an employee with an
    inactive membership at Store A and an active one at Store B logs in and
    lands in Store B's workspace normally, confirming the old
    onlyMembership() block is gone and deactivation doesn't cross stores;
    (b) an owner and an employee at a store with a past `paidThroughDate`
    both get the blocking "Plan expired" screen instead of the dashboard —
    owner sees the exact expiry date, employee sees the generic message; (c)
    a store expiring in 3 days shows the warning banner to both roles with
    the same owner/employee copy split, while the dashboard underneath
    still renders normally (not blocked). `npx tsc --noEmit` and
    `npm run lint` are clean (the only lint failures anywhere in the repo
    are pre-existing `require()` warnings in `.cursor/hooks/graft-hooks.cjs`,
    unrelated).
  - A `StoreAuditEvent` trail for lock/unlock/edit/delete/deactivate actions
    still doesn't exist (Store Detail's Activity tab remains a stub) — out
    of scope per `.agents/2026-09-brainstorm-plan.md`.
- `prisma/seed.ts` now bootstraps a **Super Admin** account (env vars kept as
  `SEED_OWNER_*` for deploy-config compatibility), not a store owner — stores
  and their owners are meant to be created via the onboarding flow once built.

### Super Admin visual reskin: in progress, screen by screen

The Super Admin UI above was functionally complete but did not match the
approved design canvas (46-screen mockup, published as an artifact earlier in
this project). A full reskin is underway, one screen at a time, against a new
`.soa`-scoped design system ported verbatim from that canvas —
`src/app/super-admin/super-admin.css` (every selector prefixed `.soa ` to
avoid colliding with legacy unprefixed classes still in `globals.css` from the
old marketing-site extraction — `.menu` and `.brand` were confirmed
collisions; a global `h1,h2,h3,p,a,span,strong,small{overflow-wrap:
anywhere}` rule from the same leftover CSS was also overridden inside `.soa`,
since it broke word-wrapping on every label in the new design). The `.menu`
collision took two passes to actually close: the first only overrode
`display`, leaving the legacy rule's `width:42px;height:42px` constraining
`RowMenu.tsx`'s popup regardless of item count (independently reproduced by
QA — DOM-measured at 42×42px against 3 real menu items). The second pass
added explicit `width:auto;height:auto` to `.soa .menu` *and* changed
`RowMenu.tsx` to render its popup via a `createPortal` (positioned from the
trigger's `getBoundingClientRect()`, `position:fixed`), so it also escapes
clipping by an ancestor table's `overflow:hidden`/`overflow-x:auto` — the
portal target must stay inside the `.soa` wrapper (`.closest('.soa')`), since
`.soa .menu`'s styling is a descendant selector that silently stops applying
if portaled straight to `document.body`. New shared pieces:
`src/features/super-admin/components/Icon.tsx` (the design's icon set),
`RowMenu.tsx` (shared row dropdown, used by Stores/Users/Plans tables),
`src/app/super-admin/layout.tsx` wraps every Super Admin page in
`soa ad-root` (both classes — `ad-root` is kept so screens not yet migrated
still resolve the old `.ad-*` design tokens, which live on `.ad-root`, not
`:root`).

Done so far, verified in the browser at desktop, tablet, and mobile widths:
**Stores list** (`StoresDirectory.tsx` — stats tiles, filter pills, avatar
table, row-action menu; the "Onboard store" button moved into its own
`OnboardStoreAction.tsx` client component so it can sit in the page header's
action slot), **Store Detail** (`StoreDetailShell.tsx` now renders the
design's own back-link/avatar/badge header and tab bar in place of the
generic page header — `SuperAdminShell`/`SuperAdminPageShell` gained a
`hidePhead` escape hatch for this; `StoreOverviewTab.tsx` rebuilt as the
design's split dashboard layout using only real data — Team/Owner/
Subscription summary cards, a stats row substituting Team members/Deposit/
Next renewal for the design's Orders/Revenue tiles since per-store order
volume isn't tracked at the Super Admin layer; the Recent Activity card
honestly shows "not tracked yet" rather than fabricating timeline entries,
consistent with the Activity tab still being a stub; `StoreUsersTab.tsx`
and `StoreSubscriptionTab.tsx`'s non-dialog chrome were restyled to match
for visual consistency within the same tab bar), and **Users list**
(`UsersList.tsx` — stats tiles, role/status filter pills, row-action menu
with Reset password/Deactivate wired in directly rather than only a bare
link to User Detail; a "Last sign-in" column from the design was dropped
since `listUsers()` doesn't cheaply compute it for every row), and
**Dashboard** (`SuperAdminDashboard.tsx` — same real-data-only substitution
pattern as Store Detail: the design's Orders/Revenue/Platform-collected stats
and monthly bar chart aren't backed by any tracked data at the Super Admin
layer, so they're replaced with the 4 real store-count tiles plus a "Store
status" bar breakdown computed from real payment-state counts; "Needs
attention" reuses `getDashboardStats()`'s existing real list; "Finish setting
up" is a genuinely real signal — stores with `paymentState === 'unset'`,
linking to that store's Subscription tab; "Accounts" is a real donut of
owners/employees/inactive from `listUsers()`; "Quick actions" reuses
`OnboardStoreAction`/`UserAddAction` — both gained a `variant="block"` prop
for this full-width context — rather than adding non-functional buttons;
"Recent activity" honestly shows "not tracked yet"; "Next renewal" lists the
soonest real `paidThroughDate`s. The page fetches `listStores()`/`listUsers()`/
`listPlans()` alongside `getDashboardStats()`, and passes `todayIST()` down
as a prop rather than calling `Date.now()` inside the component, since it's
a Server Component and React's purity rule forbids impure calls in render),
and **Subscriptions** — both `SubscriptionPlansTable.tsx` (Plans tab: table
+ row-action menu, "New plan" moved to a `PlanNewAction.tsx` phead action
matching the `OnboardStoreAction`/`UserAddAction` pattern) and
`SubscriptionsBillingTable.tsx` (Billing tab: stats tiles — Active/Due in
30 days/Overdue computed for real from `annualFeeAmount` and payment state,
not a fabricated "collected this year" figure that would need a new
aggregate-payments query; status/search filters mirroring StoresDirectory)
share `SubscriptionsShell.tsx`'s restyled tab bar. `PlanDetail.tsx` and
`InvoiceDetail.tsx` (both now `hidePhead` pages with their own back-link/
phead, like Store Detail) dropped several design elements that aren't real
in this app — Plan Detail has no "Duplicate" action (not implemented) or
change-history timeline (no audit trail); Invoice Detail has no GST
breakdown (deliberate — no tax fields exist in the schema) or activity
timeline (no audit trail). Print/View-PDF/Download-PDF buttons were added
later (2026-09-09) — see the "Invoice PDF" entry above; "Send to owner" is
still not built (needs an email provider decision).
`getPlan()`'s per-store rows were extended with `onboardedAt`/`depositAmount`/
`status` (all already in its existing Prisma include, just not previously
mapped to the DTO) so Plan Detail's "Stores on this plan" table can show
real per-store data instead of just id/name. `StoreListItem` gained
`planName` (mirroring the `ownerId` addition from the Stores-list round) so
the Billing table can show each store's plan as a chip.

**Centered form dialogs reskinned (2026-09-09)**: Plan create/edit (including
the nested onboarding plan editor), Record payment, Change plan, Store quick
edit, Add user, and the four-step Onboard wizard now share the design canvas's
centered native-dialog treatment (`Dialog.tsx`, `.scrim`, `.dialog`, and
wide/default size variants). The native `showModal()` behavior traps focus;
Escape, backdrop click, and the close button use the same close path; focus is
returned to the trigger; and dirty forms retain the existing Discard changes?
guard. Browser verification covered 1440×900, 768×900, and 375×667. The routed
Store full-edit and User detail/edit pages remain full pages. Invoice PDF and
order-invoice PDF viewers intentionally remain wide side panels. Confirmation
dialogs (Lock/Delete/Archive/Deactivate/Reset-password and dirty-form discard)
remain compact native confirmation dialogs and are still pending their separate
`.soa` cosmetic reskin. User Detail is the only full screen left on the
pre-reskin `.ad-*` styling.

## Backend migration: complete

The full migration from the browser-storage prototype to a real Postgres backend
(Neon + Prisma 7, see `BACKEND-PLAN.md`) is done. Every screen (Products, Sales,
Orders, Expenses, Employees, Profile, Dashboard) reads and writes Postgres through
Server Components/Actions — nothing in the app writes to `localStorage` anymore.

- **Auth**: sign-in (`/login`, for platform admin, owner and employee) creates a real server-side
  session — DB-backed `Session` row, HttpOnly cookie, bcrypt password check
  against the `User` table (`role` is `OWNER` or `EMPLOYEE`). See `src/server/auth/`.
  Client-side `Session`/`AdminUser` state (in `AdminProvider`) is purely a mirror
  for routing/display; every Server Action/Component independently re-verifies
  the real session via the cookie on every request.
- **Products**: `src/server/services/products.ts` + `.../actions/products.actions.ts`.
- **Orders + payments**: `src/server/services/orders.ts` + `.../actions/orders.actions.ts`.
  Order totals are always recomputed server-side from the live catalogue (never
  trusted from the client). Order creation takes a client-generated idempotency
  key so a double-submit/retry returns the existing order instead of duplicating
  it. Payment recording locks the order row (`SELECT ... FOR UPDATE`) inside a
  transaction before checking the balance, so concurrent payment attempts can't
  both read a stale balance and overpay. Status changes and the initial
  "Pending" event record the real authenticated user as the actor.
- **Expenses**: `src/server/services/expenses.ts` + `.../actions/expenses.actions.ts`.
  Recurring occurrences are generated server-side on every `listExpenses()` call,
  extended one month ahead of today, guarded by a `(seriesId, periodMonth)`
  unique constraint so repeated/concurrent generation can't create duplicate
  months or touch already-paid occurrences.
- **Employees + Profile**: `src/server/services/employees.ts` and `profile.ts` +
  their actions. Create/edit/deactivate hit the `User` table directly. Editing an
  employee's username, password, or active flag bumps `credentialVersion` and
  revokes their existing sessions immediately (a live session is force-logged-out,
  not just blocked on next login). Changing the owner's password does the same to
  their own session — verified end-to-end, including that the old password is
  rejected afterward and the new one works.
- **Dashboard**: `/` fetches orders/expenses/products server-side and reuses the
  existing pure `dashboardData()` function (`admin.analytics.ts`) — no separate
  aggregation logic was written; the date-range filtering it already did is
  unchanged, just fed from Postgres instead of `localStorage`.
- Validation errors that must show a specific message to the user (duplicate
  username, wrong current password) use a `ValidationError` class that Server
  Actions catch and return as `{ ok: false, error }` plain data, rather than
  relying on a thrown error's message crossing the Server Action boundary
  (verified: the exact message reaches the client).

### Removed as part of the cutover

The entire local browser-storage `Store`/demo-seed mechanism was deleted, not
just stopped being written to — it had zero remaining consumers once every
screen read from the server:

- Deleted: `admin.migration.ts`, `admin.demo-history.ts`, `admin.demo-income.ts`,
  `admin.expenses.ts` (the old client-side recurring-expense generator).
- Removed from `admin.data.ts`: `seed()` and its `item()` helper.
- Removed from `admin.types.ts`: the `Store` interface, `Employee.password`,
  `Session.credentialVersion`, `Expense.dueDay` — all had no remaining readers.
- `AdminProvider.tsx` no longer hydrates anything from `localStorage`; it only
  tracks the client-side session mirror (`sessionStorage`) and the dashboard
  date-range UI state. `setStore`, `changePassword` (the old demo password), and
  the employee-password browser fallback in `login()` are gone.
- `resolveUser()` (`admin.permissions.ts`) no longer takes a `Store` argument —
  it resolves purely from `session.name`, which every real login always sets.
- `dashboardData()` (`admin.analytics.ts`) takes `{ orders, expenses, products }`
  directly instead of a full `Store`, since that's all it ever read.
- Stale UI copy referencing "demo data stored in this browser" was corrected in
  `AdminShell`'s footer, `Login`'s help text, and the logout confirmation.

## Architecture and routes

Next.js App Router, React, TypeScript, plain CSS, and local Fontsource variable
fonts. `src/app/layout.tsx` loads fonts, global/admin styles, workspace metadata,
and the shared `AdminProvider`, preserving provider state across app routes.

| URL | Current behavior |
| --- | --- |
| `/` | Dashboard screen, server-fetched; signed-out users redirected to `/login`; employees redirected to their permitted home |
| `/login` | Login; authenticated users redirected to their role's home |
| `/admin` | Redirects to `/` |
| `/admin/dashboard` | Compatibility redirect to `/` |
| `/admin/login` | Compatibility redirect to `/login` |
| `/admin/products` | Owner product/service catalogue (server-backed) |
| `/admin/sales` | Owner sales listing or employee counter/POS (server-backed) |
| `/admin/orders` | Order listing available to employees and owners (server-backed) |
| `/admin/expenses` | Owner expenses (server-backed) |
| `/admin/employees` | Owner employee management (server-backed) |
| `/admin/profile` | Owner profile/password UI (server-backed) |
| `/super-admin/login` | Compatibility redirect to canonical `/login` |
| `/super-admin` | Platform dashboard: store counts, needs-attention (payment state) list |
| `/super-admin/stores` | Store directory (search, edit/lock/unlock/delete row actions) + 4-step onboarding wizard |
| `/super-admin/stores/[storeId]` | Store Detail — Overview, Users, Subscription tabs are real; Activity is a stub |
| `/super-admin/stores/[storeId]/edit` | Full store edit + Danger Zone (lock/unlock, delete) |
| `/super-admin/users` | Cross-store user directory (search, add) |
| `/super-admin/users/[userId]` | User detail — profile, store access, reset password, deactivate/reactivate |
| `/super-admin/subscriptions` | Plan library — create/edit/archive reusable plans |
| `/super-admin/subscriptions/billing` | Billing table across every store, with inline record-payment |
| `/super-admin/subscriptions/[planId]` | Plan detail — stores currently on it |
| `/super-admin/subscriptions/invoices/[invoiceSeq]` | Invoice detail |

Owners can access all screens; their sidebar uses Sales for the main order list.
Employees can access Sales and Orders only — enforced both by client-side routing
(`admin.permissions.ts`) and, for every actual mutation, server-side by the
relevant Server Action calling `requireSession()`/`requireSession('OWNER')`.
The public website is separate in `../vendor_websites/express-laundry`, served
locally at `http://127.0.0.1:5500/express-laundry/index.html`.

## State, data and security boundaries

Postgres (Neon) is the durable store for everything: products, orders, payments,
expenses, employees/owner accounts, sessions, and the store profile. See
`prisma/schema.prisma` for the full model, and `BACKEND-PLAN.md` for the phase
history and remaining hardening items (tests, deploy pipeline, observability).

Sessions are server-verified on every request via an HttpOnly cookie + a
`Session` row in Postgres; a deactivated user or one whose credentials changed
has their sessions deleted immediately, not just blocked on next login (verified
in the browser, not just unit-level). Passwords are bcrypt-hashed
(`src/server/auth/password.ts`); DTOs returned to the client never include a
password or hash.

The client-side `Session`/`AdminUser` objects (`AdminProvider`, `sessionStorage`)
exist only to drive UI routing/display without a round-trip on every navigation.
They are not trusted for authorization anywhere — every Server Action and every
data-fetching Server Component independently calls `requireSession()` against
the real cookie.

## Source map

- `src/app/`: routes and shared layout; `admin/*.css`: workspace styling. Most
  `page.tsx` files under `src/app/admin/*` are async Server Components that call
  `requireSession()` then a `src/server/services/*` list function, and pass the
  result down as a `serverX` prop to `AdminScreenContainer`.
- `src/server/db.ts`: Prisma client singleton (Neon adapter, pooled connection).
- `src/server/auth/`: password hashing, DB-backed sessions, `loginAction`/`logoutAction`.
- `src/server/services/`: one file per domain (`products`, `orders`, `expenses`,
  `employees`, `profile`) — plain, framework-agnostic functions; all validation
  (zod) and business logic lives here, not in the Server Actions.
- `src/server/pricing.ts`, `src/server/dates.ts`: shared pure helpers (slab
  pricing calc mirrored from `admin.data.ts`'s `price()`; calendar-date parsing).
- `src/server/errors.ts`: `ValidationError`, for user-facing validation messages
  that must reliably cross the Server Action boundary as data, not a thrown error.
- `src/features/admin/actions/`: thin `'use server'` wrappers — auth check,
  call the service, `revalidatePath`.
- `src/features/admin/containers/AdminProvider.tsx`: client-side session mirror
  and dashboard date-range UI state only; no data hydration.
- `src/features/admin/containers/AdminScreenContainer.tsx`: screen routing,
  guards, and the mutation handlers that call the Server Actions above —
  renders each screen's own heading + content directly (no shell wrapper;
  see "Persistent nav shell + route-level loaders" below).
- Other `containers/`: employee counter, order and product editor state.
- `src/features/admin/components/`: presentation, forms, tables, charts,
  dialogs, plus `AdminChrome.tsx` — the persistent sidebar/topbar frame,
  rendered once from `src/app/(workspace)/layout.tsx` (superseded the old
  per-page `AdminShell.tsx`).
- `admin.types.ts`, `pos.types.ts`: client data contracts (also used as the
  service layer's DTO shapes, to avoid a parallel set of types).
- `admin.data.ts`, `admin.analytics.ts`: pricing/date/summary helpers, reused
  server-side by `src/server/pricing.ts` and the dashboard page respectively.
- `admin.permissions.ts`: role access (`canAccess`/`homeFor`) and client-side
  user resolution from the session mirror.
- `admin.dialog.ts`: shared dialog/scroll behavior.
- `prisma/schema.prisma`, `prisma/migrations/`: the database schema.
- `prisma/seed.ts`: idempotent Super Admin seed script (`npx prisma db seed`).
- `src/server/services/stores.ts`: Super Admin domain logic — `listStores()`,
  `getStore()`, `getDashboardStats()`, `lookupOwnerByUsername()`,
  `onboardStore()` (transactional store+owner+subscription creation, now
  plan-or-custom), `updateStore()`, `setStoreStatus()` (lock/unlock),
  `archiveStore()` (soft delete, server-verified typed confirmation),
  `recordSubscriptionPayment()`, `listStoreInvoices()`, `getInvoice()`.
- `src/server/services/subscription-plans.ts`: the plan library —
  `listPlans()`, `getPlan()`, `createPlan()`, `updatePlan()`, `archivePlan()`
  (reassign-or-detach, transactional), `changeStorePlan()`.
- `src/server/services/platform-users.ts`: cross-store user directory logic —
  `listUsers()`, `getUser()` (includes derived `lastSignInAt` from the most
  recent `Session`), `createUser()`, `updateUser()`, `resetUserPassword()`,
  `setUserActive()`, `listStoreMembers()` (used by Store Detail's Users tab).
  Parallel to, and does not touch, `src/server/services/employees.ts` (a
  store owner's own per-store staff management, unrelated).
- `src/features/super-admin/`: the platform-admin feature slice, parallel to
  `src/features/admin/` — `actions/` (`stores.actions.ts`, `users.actions.ts`,
  `subscription-plans.actions.ts`, `auth.actions.ts`, all
  `requireSuperAdmin()`-gated), `components/` (`SuperAdminChrome` — the
  persistent app frame: sidebar/topbar/mobile drawer, rendered once from
  `src/app/super-admin/(shell)/layout.tsx` so it stays mounted across
  navigations (see "Persistent nav shell + route-level loaders" below);
  `PageHeading` — the small title/subtitle/action block each list/detail
  page renders itself as the first thing in its own content, now that the
  chrome no longer takes per-page title/subtitle/action props, `Icon` —
  shared SVG icon set for the `.soa` design system, `RowMenu` — shared
  row-action dropdown, `SuperAdminLoginForm`,
  `SuperAdminDashboard`, `StoresDirectory`, `OnboardStoreAction` (Onboard
  store button + `OnboardingWizard` dialog, reused on both the Stores page
  and the Dashboard's Quick actions), `OnboardingWizard`, `StoreDetailShell`
  (Store Detail's own back-link/avatar/badge header + tab bar),
  `StoreOverviewTab`, `StoreUsersTab`, `StoreSubscriptionTab`,
  `StoreDetailStub` (Activity only now), `StoreEditDialog`, `StoreEditFull`,
  `LockStoreDialog`, `DeleteStoreDialog`, `UsersList` (its own empty state,
  no separate empty-state component), `UserAddAction` (Add user button +
  `UserAddDialog`, reused on both Users and Dashboard), `UserAddDialog`,
  `UserDetail`, `ResetPasswordDialog`, `DeactivateUserDialog`,
  `PlansEmptyState`, `PlanNewAction` (New plan button + `PlanEditor`),
  `SubscriptionPlansTable`, `PlanDetail` (its own back-link/header, like
  Store Detail), `PlanEditor`, `PlanArchiveDialog`, `ChangePlanDialog`,
  `RecordPaymentDialog`, `SubscriptionsBillingTable`, `InvoiceDetail` (its
  own back-link/header), `SubscriptionsShell`), `containers/`
  (`StoresScreenContainer`, `UsersScreenContainer`, `PlansScreenContainer`,
  `BillingScreenContainer`), `types.ts`. (`SuperAdminPageShell`, which used
  to pass `title`/`subtitle`/`breadcrumb`/`action`/`hidePhead` through to a
  combined shell+heading component and own the logout handler, was removed —
  see "Persistent nav shell + route-level loaders" below; its logout wiring
  moved into `SuperAdminChrome` and its heading wiring into each page + the
  new `PageHeading`.)
  Every Super Admin page renders inside `src/app/super-admin/layout.tsx`'s
  `<div className="soa ad-root">` — `.soa` is the new design-canvas-matched
  system (`src/app/super-admin/super-admin.css`; see the "Super Admin visual
  reskin" section above for what's been migrated to it vs. still on `.ad-*`)
  and `ad-root` is kept alongside it so the *unmigrated* screens (User Detail,
  every dialog) still resolve the old `.ad-*` system's CSS custom properties,
  which live on `.ad-root`, not `:root`. No client-side session mirror here —
  pages call `requireSuperAdmin()` server-side.
- `src/app/super-admin/`: routes for the table above, plus
  `stores/[storeId]/{,users,subscription,activity,edit}`,
  `users/[userId]`, `subscriptions/{,billing,[planId],invoices/[invoiceSeq]}`.

## Verification baseline

Every phase of the migration was verified in the actual browser against the Neon
dev branch — not just typecheck/lint — including: owner and employee login/logout,
CRUD on each domain, server-computed order pricing, idempotent order creation
(duplicate submit produces one row), transactional payment balance checks,
session revocation on deactivate/credential-change (confirmed a live session is
killed, not just blocked on next login), and recurring-expense generation being
idempotent under repeated calls. This is not a complete automated regression
suite or a production security audit — see `BACKEND-PLAN.md`'s remaining items
(tests, deployment, observability) for what's still open.

### QA pass fixes (2026-09-09)

An external QA pass (two rounds, "GPT Astra") found 10 backend/UX findings and
8 further UI/design findings against a running dev instance. All were fixed
in the same session and re-verified in the browser (not just `tsc`/`lint`):
concurrent-renewal locking (pre-existing, independently re-verified, not
newly added here); server-side minimum password length on password change;
error surfacing for Product/Expense save failures and owner order-save
rejections (previously silent); real calendar-date validation in
`parseCalendarDate()` (previously accepted `2026-02-31` and silently rolled
it to March); annual renewal/onboarding math switched from +365 days to a
true calendar year; invoice coverage periods and paid-through dates now show
the year where ranges could otherwise read as ambiguous or zero-length; the
Users/Billing/Stores no-match search state (was showing the true first-use
empty state and hiding the search box); platform-wide summary totals on
those same screens (were computing from the filtered result, not the full
dataset); filter pills converted to real `<button>`s (previously
keyboard-inert `span[role=button]`s); the StoreOps confirmation dialog
width bug (`.ad-root.ad-confirm-dialog` needed higher specificity than the
generic `.ad-root{max-width:100%}` mobile-containment rule); the row-action
menu's clipping/sizing (see the reskin section above); a client-side session
mirror gap where a fresh browser tab (no `sessionStorage` of its own) could
wrongly bounce a signed-in user to `/login`, now reconciled against the
server via `getSessionStatusAction()`; a locked store rendering as a
misleadingly empty-but-healthy dashboard with no explanation, now shown with
an explicit banner; and the StoreOps mobile navigation drawer, rebuilt as a
native `<dialog>` (mirroring the store workspace's own `MobileNavigation`
pattern) so it gets a real focus trap and isn't tab-reachable while closed.
The header search/⌘K and notification bell were previously fully static —
⌘K and the search button now focus whichever screen's own real search input
is present; the bell stays visually present but `aria-hidden` until
notifications are built. Not fixed in this pass (flagged as out of scope):
the broader design-canvas traceability gaps (partial screens, missing PDF
generation, dashboard/analytics deferrals — all pre-existing, documented
elsewhere in this file) and the "email shown on Store Overview but blank on
full edit" observation, which the QA report itself could not reproduce
deterministically enough to isolate a cause.

### 2026-09 brainstorm, Item 5 — "Collected this year" + payment reference/recorded-by/owner contact (2026-09-09)

Per `.agents/2026-09-brainstorm-plan.md`'s Item 5. Migration
`20260909091913_subscription_payment_reference_recorded_by_and_user_contact`
(additive, applied after Item 1's `20260909091715_membership_active_and_payment_lapse`)
added `SubscriptionPayment.reference` (free text, `@default("")`),
`SubscriptionPayment.recordedById` (nullable, `SetNull` on delete), and
`User.email`/`User.phone` (both nullable — global to the person, distinct
from `Store.email`/`Store.phone`, which are the store's own contact info).

- **"Collected this year"**: `stores.ts` gained `getCollectedThisYearStats()`
  — a platform-wide `SubscriptionPayment.aggregate()` sum scoped to the
  current **financial year** (Apr 1 – Mar 31, not calendar year — the owner's
  explicit call, for auditing, matching Indian FY convention), with FY
  boundaries derived from `todayIST()`'s IST calendar date. A year-over-year
  delta (previous FY's same-window sum) is included — judged cheap enough to
  always compute alongside the main figure (one extra `SUM` aggregate, no
  joins, not a second heavy query) rather than skipped. Surfaced as a new
  stat tile on Subscriptions → Billing (`SubscriptionsBillingTable.tsx`,
  reusing the `.delta up/down` CSS class that was already in
  `super-admin.css` from the ported design system but had no consumer yet),
  wired through `billing/page.tsx` → `BillingScreenContainer.tsx`. Verified
  with a direct service-level script against the real dev database (not just
  `tsc`/lint): recorded a real payment, confirmed the aggregate reflects it
  and the FY label is correct.
- **Payment reference**: `RecordPaymentDialog.tsx` gained an optional
  "Reference" text field (UPI transaction ID, etc.); `recordSubscriptionPayment()`
  persists it; shown on `InvoiceDetail.tsx`'s Payment card when present.
- **Recorded-by attribution**: `recordSubscriptionPaymentAction` now passes
  the acting `requireSuperAdmin()` session's id through to
  `recordSubscriptionPayment()` as `recordedById` (a new, optional third
  parameter — existing callers, including the subscription-payments
  integration test, are unaffected since it's omittable and stores `null`).
  `listStoreInvoices()`/`getInvoice()` now include the recording admin's name;
  shown on `InvoiceDetail.tsx` as "Recorded by" (renders "—" for historical
  payments with no actor on file).
- **Owner email/phone**: added to the `User` model (not `Store` — the two
  represent different things, see above). Settable from User Detail
  (`UserDetail.tsx`, via `updateUser()`/`updateUserAction`) and displayed
  there; also displayed on Store Detail's Overview tab (`StoreOverviewTab.tsx`'s
  Owner card), sourced through `StoreListItem.ownerEmail`/`.ownerPhone` (set
  in `stores.ts`'s `toDTO()`, so `StoreDetail` inherits them for free).
  Verified via the same direct service-level script: set both fields through
  `updateUser()`, confirmed they read back correctly through both `getUser()`
  and `getStore()`.
- Verification for all four: `npx tsc --noEmit` and `npm run lint` clean.
  Full UI click-through in the browser was not performed for this pass — a
  concurrent agent's live session occupied the shared dev browser instance at
  verification time and logging it out to test as Super Admin risked
  disrupting their work; instead, every code path (aggregate query, payment
  recording with the new fields, owner-contact read/write) was exercised
  directly against the real Neon dev database via a disposable script
  (created and deleted outside the repo's tracked files, using throwaway
  store/user rows cleaned up at the end of the run) rather than through unit
  mocks. A follow-up browser pass matching this project's usual verification
  bar is still worth doing before considering this fully closed out.

### 2026-09 brainstorm, Item 2 — owner multi-store dashboard + switcher (2026-09-09)

Per `.agents/2026-09-brainstorm-plan.md`'s Item 2, built on top of Item 1's
`StoreMembership.active` and `onlyActiveMembership()`. No schema migration —
this item is purely session/cookie/UI plumbing around existing tables.

- **Architectural choice — a second, lightweight cookie, not the session
  cookie.** Most store-workspace pages are Server Components calling
  `requireStoreSession()` directly, and the auth session cookie (`el_session`)
  carries only identity, never a store choice, by design (store access is
  fully computed live on every call — see Item 1/3's `requireStoreSession()`
  comments). `src/server/auth/session.ts` gained two new cookies, both
  `httpOnly`, written only from Server Actions (Next.js doesn't allow cookie
  writes from Server Components):
  - `el_selected_store` — the specific store an owner is currently working
    in, read by every non-Dashboard screen (and by Dashboard when not
    showing "All stores").
  - `el_dashboard_all_stores` — Dashboard-only flag for the "All stores"
    aggregate view, kept separate from the above so navigating away from
    Dashboard's "All stores" to any other screen still lands on the last
    specific store (per the plan's explicit requirement), not a blocking
    prompt. Explicitly choosing a specific store (`setSelectedStore()`)
    clears this flag, so leaving "All stores" happens immediately, not just
    on next Dashboard load.
  - **Never trusted blindly**: `resolveStoreSelection()` re-queries the
    caller's live active `StoreMembership` rows on every call and only
    returns a cookie's storeId if it's still one of them — a stale or
    tampered cookie value is silently ignored in favor of an auto-picked
    fallback. `setSelectedStore()` does the same check before writing
    anything. And regardless of any cookie, every actual data read still
    goes through `requireStoreSession(storeId, role)`, which independently
    re-verifies membership/role/lock/archive/payment-lapse state from the
    database — the cookie is only ever a hint about *which* store to ask
    for, never an authorization.
  - **Auto-pick, never a blocking prompt**: when a multi-store owner has no
    cookie yet (or it names a store they're no longer active at),
    `resolveStoreSelection()` picks their oldest active membership
    (`orderBy: createdAt asc`) deterministically — no "choose a store" empty
    state ever renders.
  - `resolveStoreSelection(dashboard = false)` returns `null` when the
    caller has zero active memberships (unchanged fall-through to
    `requireStoreSession()`'s existing generic-FORBIDDEN handling) or a
    `{ storeId, multiStore, options, allStoresSelected }` shape otherwise —
    `multiStore` is `false` whenever there's exactly one active membership,
    which by Item 1's design is always true for employees, so this selector
    mechanism is a no-op for them without any employee-specific branching
    needed.
- **`loginAction`** previously left `storeRole` `undefined` (blocking sign-in
  entirely, via `AdminProvider`'s `if (!result.user.storeRole) return false`)
  for anyone with more than one active membership — that was Item 1's
  explicitly-deferred FORBIDDEN case. Now resolves `storeRole` to `'OWNER'`
  when there's more than one active membership and all of them are `OWNER`
  (the only real case per policy — employees stay single-membership), so a
  multi-store owner can actually sign in.
- **`getStoreAccessStatus()`** (existing, backs the client session mirror's
  blocked/warning banners) gained an optional `storeId` parameter, resolved
  the same way as `requireStoreSession()` (`resolveStoreSelection(false)` in
  `getSessionStatusAction`) — so a multi-store owner's block/warning banner
  correctly reflects their *currently selected specific store*, not an
  arbitrary/ambiguous one. This is intentionally independent of Dashboard's
  "All stores" toggle — banners always describe one specific store.
- **Header store switcher**: new `StoreSwitcher.tsx` (a filter `<input>` over
  a plain option list — not a combobox library, per the plan's own "use your
  judgement" allowance) rendered inside `AdminShell.tsx`'s topbar, only when
  the page passed more than one `storeOptions` entry (i.e. never for a
  single-store owner or any employee — `AdminScreenContainer.tsx` only
  forwards `storeOptions`/`selectedStoreId` when `resolveStoreSelection()`
  reported `multiStore`). "All stores" only ever appears as an option when
  `screen === 'dashboard'`. Selecting an option calls a new Server Action
  (`selectStoreAction`/`selectDashboardAllStoresAction` in
  `src/server/auth/actions.ts`, thin wrappers over `setSelectedStore()`/
  `setDashboardAllStores()`) then `router.refresh()` — same
  mutate-then-refresh pattern used everywhere else in this container. The
  sidebar's static "One store. Everything in view." copy now reads "Switch
  stores from the header above." for multi-store owners.
- **Every `src/app/admin/*/page.tsx` and `src/app/page.tsx`** now call
  `resolveStoreSelection()` before `requireStoreSession()` and pass an
  explicit `storeId` only when `multiStore` is true (single-store owners and
  employees get `undefined`, exactly the pre-Item-2 code path, unchanged).
  Products/Sales/Orders/Expenses/Employees/Profile all resolve to one
  specific store with no "All stores" option ever offered, per the plan.
- **Dashboard aggregation** (`src/app/page.tsx`): when `allStoresSelected` is
  true, fetches orders/expenses/products for every one of the owner's active
  stores in parallel, each independently re-verified through
  `requireStoreSession(storeId, 'OWNER')` (a store that's individually
  blocked — locked/archived/payment-lapsed — silently contributes nothing
  rather than failing the whole aggregate), concatenates the three arrays,
  and feeds them into the same existing, unmodified `dashboardData()` — no
  new aggregation logic was written, matching this repo's existing
  "Dashboard reuses the pure `dashboardData()` function" convention. When a
  specific store is selected (or the owner has only one store), behavior is
  byte-for-byte the same single-store path as before this item.
- **Verified**: `npx tsc --noEmit` and `npm run lint` clean (only the
  pre-existing unrelated `.cursor/hooks/graft-hooks.cjs` require() errors).
  Browser-verified with a disposable two-store test owner (two throwaway
  `Store`/`Subscription`/`StoreMembership` rows plus one `User`, created via
  script, cleaned up after): login as the multi-store owner succeeds and
  auto-picks the oldest store; the header switcher shows "All stores" plus
  both stores only on Dashboard; Products (and, by the same code path,
  Sales/Orders/Expenses/Employees/Profile) shows only the selected store's
  data with no "All stores" option in its switcher; switching stores from
  Products correctly isolates data (a product created in one store never
  appeared in the other) and persists across reload; choosing a specific
  store also silently exited Dashboard's "All stores" view on next visit, as
  designed. The browser session was cut short partway through (a concurrent
  agent's own live browser-based verification of Item 7 interleaved with
  this one, since both share the single dev browser instance — the same
  constraint noted in the Item 5 entry above) before the numeric "All
  stores" sum could be eyeballed on-screen; that specific gap was closed
  instead with a direct script-level check — seeded a real order in each of
  the two throwaway stores, loaded both through the same `dashboardData()`
  function `src/app/page.tsx` calls, and confirmed the "All stores" call's
  `todaySales`/`periodSales`/`periodOrders` equal the exact sum of the two
  single-store calls (₹100 + ₹200 = ₹300, 1 + 1 = 2 orders). Regression
  checks for single-store owners: an existing single-store (archived) test
  owner's blocking screen and logout still worked normally, unaffected. A
  full interactive browser pass of the "All stores" tile numbers rendering
  on-screen (as opposed to the underlying data being provably correct) is
  still worth doing once the shared dev browser is free.

### 2026-09 brainstorm, Item 7 — customer-facing order invoice (2026-09-09)

Per `.agents/2026-09-brainstorm-plan.md`'s Item 7: a second, entirely
separate invoice system from the existing platform → store owner
subscription billing invoice (`SubscriptionPayment.invoiceSeq`,
untouched by this item) — this one is store → customer, for a laundry
order. Migration `20260909101024_add_order_invoice` (additive, applied
after Item 1's `20260909091715_membership_active_and_payment_lapse` /
Item 5's `...reference_recorded_by_and_user_contact`) adds `OrderInvoice`:
`invoiceSeq Int @unique @default(autoincrement())` (one global sequence
across the whole platform, not per-store — an explicit product decision,
for consistency with how order numbers and the other invoice system already
work), `orderId String @unique` (one invoice per order, `onDelete: Cascade`),
`storeId`, `generatedAt`. Deliberately thin: no snapshotted line items or
amounts of its own — `OrderLine`/`Payment` rows are already immutable once
created, so the invoice just pins a stable number and reads everything else
(items, customer name/phone, amounts, payment status) live off the order it
documents, via a new `src/server/services/order-invoices.ts` service
(`getOrCreateOrderInvoice(storeId, orderCode)`, no auth check of its own —
callers gate access, matching the rest of `orders.ts`).

- **Eager vs. lazy — went lazy.** No invoice row exists until someone
  actually asks to view/print/download/share one; opening an order's detail
  panel alone never creates one. `getOrCreateOrderInvoice()` uses a single
  atomic `prisma.orderInvoice.upsert()` keyed on the unique `orderId`, so a
  concurrent double-click can't create two invoices or skip a sequence
  number — exactly one `INSERT` ever happens for a given order, and the
  autoincrement is only consumed once, ever. `parseOrderCode`/`toOrderCode`
  (previously private to `orders.ts`) are now exported so the invoice
  service can resolve `EL-<n>` order codes without duplicating that regex.
- **Numbering/display**: `src/lib/invoiceNumber.ts` (`formatInvoiceNumber()`)
  is a new, deliberately guard-free (no `server-only`) shared helper —
  usable from both server (PDF template, route) and client (action button
  labels) — producing the zero-padded `INV-000123` display format, matching
  the convention already used for subscription invoices
  (`SubscriptionsBillingTable.tsx`'s inline `INV-${...padStart(6,'0')}`,
  which had no extracted helper before this).
- **PDF**: `src/features/admin/pdf/OrderInvoicePdf.tsx` mirrors
  `src/features/super-admin/pdf/InvoicePdf.tsx`'s `@react-pdf/renderer`
  styling/layout exactly. Content: invoice number, order number, order/
  delivery dates, store name/address/phone, customer name/phone, a line-item
  table (service, qty/kg, rate, amount — all read from `OrderLine`), order
  total, a payment section (method — or "Multiple" when more than one
  distinct method was used, or "-" when unpaid — amount paid, balance due),
  and a payments-received table when any payments exist. No GST/tax fields
  anywhere, per the plan's explicit exclusion.
- **Route**: `src/app/admin/orders/[orderCode]/invoice/pdf/route.tsx` (Node
  runtime, same requirement as the subscription route), gated by
  `requireStoreSession()` with no role restriction (owner or employee — same
  access as today's order detail view). `?download=1` switches
  `Content-Disposition` from `inline` to `attachment`, filename
  `INV-000123.pdf`.
- **UI**: `OrderInvoiceActions.tsx` (new, in `src/features/admin/components/`)
  mirrors `InvoiceActions.tsx`'s exact pattern — Print/View/Share/Share via
  WhatsApp/Download buttons — added to `OrderDetails.tsx`'s summary column,
  above `OrderPaymentSummary`. Since the invoice number isn't known until
  first requested (lazy get-or-create), the component resolves it on demand
  via a new `getOrderInvoiceNumberAction` Server Action the first time any
  action needs it (View/Print/Share/WhatsApp), caching it in state after;
  the plain `<a>` Download link doesn't need it client-side at all since the
  PDF route resolves/creates the invoice itself and sets the filename
  server-side. `OrderInvoicePdfViewer.tsx` mirrors `InvoicePdfViewer.tsx` —
  an in-app `Panel` with an iframe plus Open-in-new-tab/Download buttons —
  reusing the `.ad-pdf-viewer`/`.ad-pdf-toolbar`/`.ad-pdf-frame` CSS classes
  already present in `admin.css`. Two invoice systems intentionally share
  the *pattern*, not the components — kept separate (not refactored into one
  shared implementation) since the existing subscription invoice components
  are Super Admin-only, cross-cutting, and out of this item's touch scope.
- **Verified against the real dev database via the browser** (own disposable
  test owner/membership on the "Sunrise Laundromat" store, cleaned up
  afterward): opened a real paid order (EL-10) and an unpaid order (EL-11);
  View invoice produced `INV-000001.pdf` and `INV-000002.pdf` respectively,
  with correct store/customer/line-item/total/payment data and no tax
  fields; re-opening EL-10's invoice repeatedly kept returning
  `INV-000001` (confirmed not incrementing on repeat views); Download link
  and Print/WhatsApp buttons correctly hit
  `/admin/orders/<code>/invoice/pdf` with `?download=1` where expected
  (`window.open`-based Print/WhatsApp trigger the right requests/URLs, but
  actually landing on the popped-up tab/WhatsApp Web couldn't be observed
  in this sandboxed browser pane, which never surfaces `window.open`
  targets as separate tabs — the same limitation would apply equally to the
  already-shipped subscription invoice's identical `InvoiceActions.tsx`
  pattern, so this isn't a new risk introduced here). `npx tsc --noEmit`
  and `npm run lint` both clean (pre-existing `require()`-import lint errors
  in `.cursor/hooks/graft-hooks.cjs` are unrelated to this change).

#### Customer-link access fix and WhatsApp file-first delivery (2026-09-09)

The original Item 7 verification above only exercised invoice URLs while a
store user was logged in. It therefore missed that the URL copied to a
customer was the authenticated `/admin/orders/<orderCode>/invoice/pdf`
route and returned `401` in a customer's browser. Migration
`20260909123000_order_invoice_tokens_and_store_payment_methods` fixes that
without weakening any admin route:

- `OrderInvoice.accessToken` is a required unique opaque token. Existing
  invoices are backfilled with random UUID-derived values in the migration;
  new invoices receive 32 cryptographically random bytes encoded as base64url
  in the existing atomic upsert. The no-op update preserves both invoice
  number and token forever.
- `GET /i/[token]` is the only public invoice surface. It validates the token
  shape, fetches the invoice by its unique token, renders the same customer
  PDF, supports `?download=1`, and returns `private, no-store`. Invalid or
  altered tokens return `404`. The internal
  `/admin/orders/[orderCode]/invoice/pdf` route still calls
  `requireStoreSession()` and remains the View/Print/Download route for staff.
- The invoice Server Action now returns `{ invoiceSeq, accessToken }` after
  authenticating the staff member. Share actions build only `/i/<token>`
  customer URLs; sequential order and invoice numbers are never exposed as
  access credentials.
- Both Share and Share via WhatsApp fetch the public PDF, wrap it in a real
  `File`, and first call Web Share file mode when `navigator.canShare`
  supports it. The dedicated WhatsApp action falls back to `wa.me` with the
  public link only after file sharing is unavailable or fails, and visibly
  reports: “WhatsApp doesn't support direct file sharing on this browser —
  sending a link instead”. A cancelled native share stays cancelled.
- The WhatsApp Business Cloud API remains deliberately out of scope. A
  guaranteed server-side send requires a Meta business account, registered
  number, approved templates, credentials, and an explicit product decision.
  The Super Admin subscription invoice remains session-only and unchanged
  because no external sharing flow uses it.

Verification: the optimized Next build compiles the dynamic public and
internal PDF routes; a no-cookie public request returns `200 application/pdf`
with a valid `%PDF-` signature, a one-character token mutation returns `404`,
and the internal route returns `401`. Disposable-PostgreSQL integration
coverage proves tokens are stable, random, and resolve without a session.
The migrations are deployed to the configured development Neon database.
Live testing caught that the first migration's existing-row backfill produced
64-character hex tokens while the route accepts 43-character base64url tokens;
follow-up migration `20260909133000_normalize_invoice_access_tokens` normalizes
only those just-backfilled values to 32 random bytes encoded as base64url.

### Per-store customer payment methods (2026-09-09)

Customer-order payment choices are now owned by each store instead of the
shared Cash/UPI UI constant:

- The same additive migration creates `StorePaymentMethod` with store,
  free-text name, active state, and creation date, then inserts Cash and UPI
  for every existing store. Store onboarding creates those two defaults for
  every future store as part of its transaction.
- `Payment.method` changes from the platform `PaymentMethod` enum to `TEXT`.
  Each payment snapshots the selected method name, so later rename or
  deactivation never changes an order's history or invoice. The enum and
  `SubscriptionPayment.method` remain unchanged for Super Admin subscription
  billing; its fixed Cash/UPI options now live only in that dialog.
- Owners manage methods under Profile → Payment methods. They can add,
  rename, deactivate, and reactivate methods; deletion is intentionally not
  offered, duplicate names are rejected case-insensitively, and the service
  prevents deactivation of the final active method. Actions require an Owner
  store session and every query is scoped by `storeId`.
- Employee Sales, owner order creation, and order payment recording receive
  the current store's active list from their server page. Both create-order
  and record-payment services recheck the submitted method against an active
  row for that store, so stale or cross-store values are rejected server-side.
  Inactive methods remain readable in existing payment history and PDFs.
- The management rows wrap at 560px, the add form becomes one column, and all
  controls retain the workspace's minimum touch sizes. No new full-width
  confirmation dialog was introduced.

Verification: migration replay and six integration tests pass in a fresh,
Unix-socket-only disposable PostgreSQL cluster. Coverage includes two-store
isolation, case-insensitive duplicate rejection, active-only enforcement,
tamper-resistant invoice access, historical method-name preservation after
rename, and rejection after deactivation. `npx tsc --noEmit`, `npm run lint`,
and `npm run build` are clean. Live browser testing on Sunrise Laundromat added
`QA Card`, used it to settle `EL-11`, generated/viewed `INV-000002`, then
deactivated it; `QA Card` disappeared from active choices while the order and
PDF retained it in payment history. Desktop and narrow mobile layouts were
visually checked with no overflow or full-width dialog regression.

#### Invoice PDF currency rendering correction (2026-09-09)

Artifact-level PDF rendering found that Helvetica lacks the Indian rupee
glyph: `₹25` rendered as `¹25` even though browser previews and text checks
appeared successful. Both customer-order and Super Admin subscription invoice
templates now use the shared PDF-safe `pdfMoney()` formatter (`Rs. 25`) while
the web UI keeps `₹`. The downloaded public invoice was re-rendered as PNG and
text-extracted: one clean A4 page, no clipping, correct totals, and the inactive
`QA Card` historical payment present in both summary and payment table.

#### Fresh/wiped database no longer auto-creates a placeholder "Express Laundry" store (2026-09-09)

After wiping the dev Neon branch's tables and redeploying, the app still
showed a store named "Express Laundry" with a subscription (₹10,000
deposit / ₹5,000 annual fee) — not stale data, but a **hardcoded fallback
INSERT inside the historical `20260907173038_multi_tenant` migration**
(`WHERE NOT EXISTS ... SELECT 'store-express-laundry-01', 'Express Laundry'`,
plus an unconditional default-subscription INSERT), which unconditionally
recreates that placeholder store any time the full migration history replays
against an empty database — exactly what `vercel-build`'s `prisma migrate
deploy` does after a wipe. `prisma/seed.ts` was confirmed unrelated; it only
upserts the Super Admin `User` row, never a `Store`. Directly querying the
live dev DB confirmed the placeholder had 0 products/0 orders/0 memberships —
a fresh shell, not leftover business data.

Initially fixed with a new, additive migration,
`20260909140000_remove_empty_placeholder_store`, that deleted the
`store-express-laundry-01` row only when it had zero products, orders, and
store memberships. **That migration file no longer exists** — it was folded
away by the squash below, which removes the placeholder-creating fallback
entirely rather than cleaning up after it. Superseded, kept here only for
the root-cause history.

#### Migration history squashed to a single baseline (2026-09-09)

At the user's request, all 13 migrations up to and including the placeholder
fix above were deleted and replaced with one fresh migration generated from
the current `prisma/schema.prisma`:
[prisma/migrations/20260909140443_init_storeops_schema/migration.sql](../prisma/migrations/20260909140443_init_storeops_schema/migration.sql)
(411 lines — every table/enum/index/constraint in one file, no data-backfill
statements and no "Express Laundry" fallback of any kind). **Dev branch
only**, by explicit user choice — production's migration history and schema
were intentionally left untouched.

Procedure used: deleted every folder under `prisma/migrations/` except
`migration_lock.toml`; dropped and recreated the dev DB's `public` schema
(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, which also removed the
old `_prisma_migrations` tracking table) for a truly empty starting point;
ran `npx prisma migrate dev --name init_storeops_schema` against the dev
branch, which diffed the empty database against `schema.prisma` and
generated+applied this one migration. Verified: all 18 expected tables exist,
`stores` has 0 rows, `npx tsc --noEmit` and `npm run lint` are clean.

**Critical caveat for whoever next touches production**: production's
`_prisma_migrations` table still records the old 13 migration names, which
no longer exist in this repo's `prisma/migrations/` folder. If `vercel-build`
(`prisma migrate deploy`) is ever run against production as-is, Prisma will
try to apply the new `20260909140443_init_storeops_schema` migration there
too — but production's tables already exist (created by the old history), so
every `CREATE TABLE`/`CREATE TYPE` in that migration will fail against
production. **Do not deploy this build to production until production's
migration tracking is reconciled first**, e.g. by running
`npx prisma migrate resolve --applied 20260909140443_init_storeops_schema`
against production's `DIRECT_URL` (marks it as already-satisfied without
running its SQL — safe, since production's actual schema already matches
this migration's end state; it was generated from the same `schema.prisma`
production is already running). This reconciliation was **not** performed as
part of this change, per the user's explicit "dev only" scope.

### Persistent nav shell + route-level loaders (2026-09-09)

Navigating either app (Super Admin, store workspace) felt slow: clicking any
nav link showed a blank/frozen moment before the destination screen
appeared. Root cause: the sidebar/topbar chrome (`SuperAdminShell` /
`AdminShell`) was rendered *inside* every page's own Server Component tree,
not in a `layout.tsx`. Since the chrome sat below each page's own data-fetch,
and the app had exactly one `loading.tsx`/`error.tsx` pair (at the site
root, `src/app/loading.tsx`/`error.tsx`), that single root boundary was the
*only* Suspense fallback active for every client-side navigation in the
entire app — so every navigation blanked the whole visible app (nav
included) until the destination page's data resolved, then swapped the
whole tree back in at once.

Fixed by moving the chrome into real Next.js layouts, so it stays mounted
across navigations, plus adding narrow `loading.tsx` files so only the
content column shows a lightweight, non-blocking spinner (`.content-loading`
+ the existing `.ad-spinner`/`@keyframes ad-spin` from `globals.css`) while
a destination page's data is in flight — the sidebar/topbar and their nav
highlighting/breadcrumb never unmount. `src/app/loading.tsx`/`error.tsx`
remain as the outer fallback for `/login`, `/super-admin/login`, and
genuinely top-level failures; they're simply no longer the *active*
boundary for in-app navigation.

- **Super Admin**: new route group `src/app/super-admin/(shell)/` holds
  everything except `login/` (dashboard, `stores/**`, `users/**`,
  `subscriptions/**` — route groups don't appear in the URL, so
  `/super-admin`, `/super-admin/stores`, etc. are unchanged).
  `(shell)/layout.tsx` calls `requireSuperAdmin()` once and renders the new
  `SuperAdminChrome` (`src/features/super-admin/components/SuperAdminChrome.tsx`,
  adapted from the old `SuperAdminShell` minus its `phead` block) wrapping
  `{children}`. `(shell)/loading.tsx` is the shared spinner, covering every
  route in the group. Every page under the group dropped its
  `SuperAdminPageShell` wrapper and now renders its own heading directly via
  the new `PageHeading` component (or, for pages with their own custom
  header — Store Detail, Plan Detail, Invoice Detail — nothing at all, since
  those already render their own back-link/header as page content).
  `SuperAdminShell.tsx` and `SuperAdminPageShell.tsx` were deleted (both
  fully superseded). The chrome's topbar breadcrumb is now purely
  pathname-derived ("Platform › Stores", etc.) rather than taking a
  per-page `title`/`breadcrumb` prop, since the chrome no longer receives
  page props — the small, real navigational context (e.g. a store's actual
  name) still shows up correctly, just as part of that page's own
  content (`StoreDetailShell`'s "← Back to stores" header, etc.), not the
  persistent topbar.
- **Store workspace**: new route group `src/app/(workspace)/` holds the root
  dashboard `page.tsx` and the entire `admin/` folder (Sales/Orders/
  Products/Expenses/Employees/Profile + the compat-redirect routes);
  `src/app/login/` stays outside, unchanged. `(workspace)/layout.tsx` is a
  Server Component that calls `resolveStoreSelection(true)` for the
  store-switcher's own data (a cheap, separate call from each page's own
  data-fetch — the layout never touches the slow
  `Promise.all([listOrders, listProducts, ...])` calls, which stay in each
  page) and renders the new `AdminChrome`
  (`src/features/admin/components/AdminChrome.tsx`, adapted from the old
  `AdminShell` minus its `ad-page-heading` block) wrapping `{children}`.
  `(workspace)/loading.tsx` is the shared spinner. `AdminChrome` derives the
  active nav item from `usePathname()` instead of a `screen` prop, and reads
  `name`/`role` directly from the existing client-side `useAdmin()` session
  context (`AdminProvider`, already mounted at the root layout and spanning
  every navigation) instead of via props — no new data plumbing needed.
  `AdminScreenContainer.tsx` no longer renders `AdminShell`; it returns its
  existing inner JSX directly, with the heading block (title/description/
  the Sales screen's "+ New sale" button) relocated here from the old shell
  component — a pure relocation, not a rewrite, since the button's `open()`
  callback was already local to this component. Every admin `page.tsx` also
  dropped the `storeName`/`storeOptions`/`selectedStoreId`/
  `allStoresSelected` props it used to compute and pass down purely for the
  old shell's display — the chrome now resolves that itself in the layout;
  each page's own `resolveStoreSelection()` call (needed regardless, to pick
  which store's data to fetch) is unchanged. `AdminShell.tsx` was deleted
  (fully superseded).
- The sidebar's own logout confirmation (a `ConfirmationDialog` + local
  state) now lives directly in each chrome component (`AdminChrome`,
  `SuperAdminChrome`), fully self-contained — `AdminScreenContainer` keeps
  its own separate copy for the Profile screen's in-content logout button,
  a small deliberate duplication rather than cross-boundary plumbing between
  a layout-level component and a page-level one.
- Verified in the browser end-to-end with a disposable test store/owner
  (created via the onboarding wizard, fully deleted after): logged in as
  Super Admin and clicked through Dashboard → Stores → a store's Overview/
  Users/Subscription tabs → an invoice detail → Subscriptions (Plans and
  Billing tabs) → Users, confirming the sidebar/topbar never unmounted and
  only the content column updated on every navigation, including onboarding
  a real store through the wizard (a Server Action + `router.refresh()`,
  confirming layouts correctly re-render on mutation). Logged in as the new
  store owner and clicked through Dashboard → Products → Sales (including
  opening the "+ New sale" panel, confirming the relocated button wiring
  works) → Employees → Profile, with the same persistent-chrome result.
  Locked the test store from Super Admin and confirmed the owner's next
  sign-in shows `AccessBlockedScreen` with the chrome (nav, logout) still
  fully reachable around it — re-verifying the specific regression
  `AdminScreenContainer`'s blocked-screen branch was already guarding
  against, now that the chrome's mount location changed. Logout was
  verified from both a normal screen and the blocked screen, in both apps.
  `npx tsc --noEmit` and `npm run lint` are clean.

## Mobile HTTP API (`/api/v1/**`): MyShop Flutter app surface built and tested

Phase 1 of the mobile app foundation (`.agents/MOBILE-API-TASKS.md`) is built and
verified against an isolated PostgreSQL integration test cluster.

- **Schema changes (B1)**:
  - `Session.token`: Unique 32-byte base64url string (43 characters), indexed for fast lookup (`prisma/migrations/20260911051700_add_session_tokens_and_password_flag`). Existing sessions backfilled with secure random base64url tokens via PostgreSQL `pgcrypto`.
  - `User.mustChangePassword`: Boolean flag default `false`. Automatically set to `true` on initial creation of employees, admin-reset passwords, or owner password reset. Cleared when user completes set/change password.
  - `WorkStatus` extended: Added `READY` and `DELIVERED` to the database enum (`prisma/migrations/20260911052200_extend_work_status`). Existing `COMPLETED` records migrated to `DELIVERED`. The full lifecycle now exposes 4 states: `Pending`, `In Progress`, `Ready`, and `Delivered`.
- **Auth Infrastructure (B2)**:
  - `src/server/auth/token.ts`: Crypto-secure 32-byte base64url token generator (`generateSessionToken`) and format validator.
  - `src/server/auth/throttle.ts`: In-memory sliding-window rate limiter (5 failed attempts per 15-minute window per IP / normalized username). Blocks brute-force login attempts with `429 Too Many Requests`.
  - `src/server/auth/session.ts`: Dual auth support — bearer token (`Authorization: Bearer <token>`) on HTTP API routes, with graceful cookie fallback (`el_session`) for browser requests. Added `getSessionFromRequest`, `requireApiAuth`, `requireApiStoreSession`, and `requireSuperAdminFromRequest`.
- **API Handler & Response Envelope (B3)**:
  - `src/server/api/handler.ts`: Unified wrapper for JSON envelopes, error translation (`AuthError` 401/403 with structured `reason`, `ValidationError`/`ZodError` 400, unhandled 500 without leaking internals), `X-Store-Id` header resolution, and mandatory `Cache-Control: private, no-store` on all API responses.
- **API Route Handlers (B4)**:
  - **Auth**:
    - `POST /api/v1/auth/login`: Authenticates owner or employee, issues 30-day token, enforces login throttle.
    - `POST /api/v1/auth/logout`: Revokes active session.
    - `GET /api/v1/auth/status`: Returns current user, store role, active store, and `mustChangePassword` flag.
    - `POST /api/v1/auth/change-password`: Verifies current password, updates hash, clears `mustChangePassword`, revokes old sessions.
    - `POST /api/v1/auth/set-password`: Allows initial password setup when `mustChangePassword` is active.
  - **Store Memberships**:
    - `GET /api/v1/memberships`: Returns caller's active stores for mobile store-switcher.
  - **Products**:
    - `GET /api/v1/products`: Lists store catalog (ITEM and WEIGHT products with slabs).
    - `POST /api/v1/products`: Creates product with validation (OWNER only).
  - **Orders**:
    - `GET /api/v1/orders`: Lists store orders.
    - `POST /api/v1/orders`: Creates order with server-side price recomputation (`src/server/pricing.ts`) and client idempotency key pass-through.
    - `GET /api/v1/orders/[orderCode]`: Detailed order view with status history, payments, and invoice status (`exists`, `canGenerate`, `accessToken`, `invoiceSeq`, `generatedAt`).
    - `PATCH /api/v1/orders/[orderCode]/status`: Updates work status (`Pending`, `In Progress`, `Ready`, `Delivered`).
    - `POST /api/v1/orders/[orderCode]/payments`: Records order payment with transaction-level `SELECT ... FOR UPDATE` row lock, preventing concurrent overpayment. Allowed for both `OWNER` and `EMPLOYEE`.
    - `GET /api/v1/orders/[orderCode]/invoice`: Get-or-create customer invoice. Refuses generation unless order is paid in full and delivered.
    - `GET /api/v1/orders/[orderCode]/invoice/pdf`: Streams customer invoice PDF binary with `Content-Type: application/pdf`.
  - **Payment Methods**:
    - `GET /api/v1/payment-methods`: Lists active payment choices configured by store.
    - `POST /api/v1/payment-methods`: Creates custom payment method (OWNER only).
    - `PATCH /api/v1/payment-methods/[id]`: Renames or activates/deactivates method.
  - **Expenses**:
    - `GET /api/v1/expenses`: Lists store expenses.
    - `POST /api/v1/expenses`: Records new expense (OWNER only).
    - `POST /api/v1/expenses/[id]/pay`: Marks expense as paid.
  - **Employees**:
    - `GET /api/v1/employees`: Lists store employees (OWNER only).
    - `POST /api/v1/employees`: Creates employee user and membership with `mustChangePassword: true`.
    - `PUT /api/v1/employees/[id]`: Updates employee name/phone/password.
    - `POST /api/v1/employees/[id]/toggle-active`: Activates or deactivates employee and revokes active sessions immediately.
  - **Profile**:
    - `GET /api/v1/profile`: Returns user profile details.
    - `PUT /api/v1/profile`: Updates user name/phone.
  - **Dashboard**:
    - `GET /api/v1/dashboard`: Reuses server aggregation `dashboardData()` without duplicating metrics.
- **Architectural & Design Decisions Resolved (B0)**:
  - **B0.1 (WorkStatus vocabulary)**: Extended enum to 4 statuses (`Pending`, `In Progress`, `Ready`, `Delivered`). Migrated legacy `COMPLETED` to `DELIVERED`. Web workspace and mobile API aligned.
  - **B0.2 (Employee balance collection)**: Relaxed `recordPaymentAction` and `/api/v1/orders/[orderCode]/payments` to allow `EMPLOYEE` role alongside `OWNER`.
  - **B5.1 (Invoice settlement gate)**: `getOrCreateOrderInvoice` refuses invoice creation unless the order is both paid in full and marked `DELIVERED`.
- **Integration Test Verification (B6)**:
  - `tests/mobile-api.integration.test.ts` added to the test suite (`scripts/test-subscription-payments.mjs`).
  - 12 integration tests run against a real, isolated PostgreSQL cluster, covering:
    - B6.1: Auth matrix (no token, expired token, revoked token, deactivated user, stale credentialVersion, wrong store, wrong role).
    - B6.2: 403 `FORBIDDEN` reason codes (`membership_inactive`, `store_locked`, `store_archived`, `payment_lapsed`).
    - B6.3: Idempotent order creation (same idempotencyKey returns identical order, creates only 1 DB row).
    - B6.4: Concurrency control (`SELECT ... FOR UPDATE` row locking prevents overpayment).
    - B6.5: Invoice settlement enforcement (400 when unpaid/undelivered; 200 when paid in full and delivered).
    - B6.6: Cross-store tenant isolation (tokens cannot read or mutate other stores' data, even when spoofing `X-Store-Id`).

## Multi-Outlet & Organization Foundation (Backend Task B1)

- **Architecture context**: `Store` is a temporary code and database model/table name serving as the organization-level tenant during the outlet rollout. Current memberships, subscriptions, and operational records remain attached to `Store`.
- **Schema-only foundation**: Migration `20260914005500_add_outlet_and_payment_foundation` adds backward-compatible, strictly additive schema definitions:
  - `OutletStatus` enum (`ACTIVE`, `CLOSED`, `RELOCATED`)
  - `Outlet` model (mapped to `outlets`, belongs to `Store`, indexed on `storeId`, unique `outletCode`)
  - `OutletMembership` model (mapped to `outlet_memberships`, links `User` and `Outlet`, unique `[userId, outletId]`)
  - `PlatformPaymentMethod` model (mapped to `platform_payment_methods`, unique `code`)
  - `OrganizationPaymentMethod` model (mapped to `organization_payment_methods`, links `Store` and `PlatformPaymentMethod`, unique `[storeId, platformPaymentMethodId]`)
  - `AuditLog` model (mapped to `audit_logs`, nullable relations to `Store`, `Outlet`, and `User`, indexed by entity and timestamp)
  - `Subscription.trialEndsAt`: Nullable `@db.Date` column added to `subscriptions` table.
- **Current status**: Outlets and new payment/audit models are schema-only in this batch. They are NOT yet used for authorization, operational queries, reports, or UI. Multi-outlet behavior is not implemented in this phase.

## Organization & Outlet Access Context (Backend Task B2)

- **Access model & helpers (`src/server/auth/session.ts`)**:
  - Added `OutletSession`, `AllowedOutlet`, and `SubscriptionAccessState` (`ACTIVE`, `TRIAL`, `TRIAL_ENDING`, `SUBSCRIPTION_ENDING`, `RESTRICTED`).
  - Added `requireOutletSession` and `requireOutletSessionFromRequest`: enforces live active organization membership, verifies outlet belongs to organization and is `ACTIVE`, permits `OWNER` across all store outlets, and requires `EMPLOYEE` to hold an active `OutletMembership`.
  - Added `resolveAllowedOutlets` to derive permitted outlets and designated default outlet per user per organization.
- **Request resolution (`src/server/api/handler.ts`)**:
  - Added `resolveOutletIdFromRequest` (`X-Outlet-Id` header and `outletId` query param) and `requireApiOutletSession`.
- **Additive login context (`POST /api/v1/auth/login`)**:
  - Response extended with `organizations` array (including `id`, `name`, `role`, `status`, `isLocked`, `blockedReason`, `paidThroughDate`, `trialEndsAt`, `subscriptionState`, `allowedOutlets`, and `defaultOutletId`), while maintaining backward compatibility with `stores`.
- **Employee constraints (`src/server/services/employees.ts`, `src/server/services/outlets.ts`)**:
  - Enforced single-organization active restriction for employees in `updateEmployee` and `toggleEmployeeActive`.
  - Added transactional `assignDefaultOutlet` and `assignEmployeeToOutlet` ensuring exactly one default outlet per employee per organization.
- **Verification**: Verified via 5 dedicated integration tests in `tests/outlet-auth.integration.test.ts` (19/19 test suite pass, zero lint warnings, clean `tsc --noEmit`).

### StoreOps feedback implementation (2026-09-26)

- Unified login routes all roles using the server result. Logout waits for
  session destruction, then clears sessionStorage and the legacy el_draft key.
- Organization detail adds Add outlet and Employees header actions. Add outlet
  requires phone in the form. PDF viewers show loading status until iframe load.
  Header search is decorative; the broken Cmd/Ctrl+K shortcut is removed.
- Onboarding uses a compact plan radio list; billing cycle is plain Yearly text.
- Plan and platform payment method lists use 60-second tagged caches. Mutations
  immediately expire tags, including plan assignment and onboarding counts.
- Four indexes added for user phone, session expiry, subscription paid-through,
  and order date. Migration SQL is generated and verified locally; remote
  application is pending approval (migrate dev escalation was rejected).
- Integration tests mock only the Next cache boundary outside the framework;
  their database, authorization, and transaction behavior remains real.

Feedback validation: Prisma schema validation and TypeScript passed; ESLint
has zero errors and two pre-existing warnings in the unrelated QA audit script.
All 62 isolated PostgreSQL integration tests pass, including five onboarding
regressions and application of the generated index SQL. Production build passed.
In-app browser verified super-admin sign-in through /login, authenticated-login
redirect, logout to /login, required organization/outlet phones, new-owner phone
field, compact plan rows, Yearly billing text, and org header actions. Subscription
PDF loading status cleared on iframe load, but rendered PDF content remained blank
in this browser. Owner/employee browser flows, order PDF rendering, and the live
onboarding success screen remain unverified; no live QA organization was created.


### Onboarding plan UI correction (2026-09-26)

Plan choices show the annual fee and the effective deposit (or waiver). The
charge-deposit-anyway control is removed; onboarding follows the plan's waiver.
Discounts have no cap relative to the plan price and apply to deposit plus the
first annual fee, with the amount due floored at zero. The full discount is
retained on the subscription. The legacy mark-paid service path allocates the
discount to deposit first, then first-year maintenance. Desktop and 390px mobile
plan UI checked with an unsaved draft; no organization was created. TypeScript,
lint (two existing warnings), and 63 local integration tests passed.


### Onboarding, subscription lifecycle, and PDF preview (2026-09-26)

Supersedes the earlier plan-only onboarding description. Onboarding offers a
plan, free trial, or custom terms. Trial dates must be valid future IST calendar
dates; trial onboarding creates no invoice or paid-through term. Plan/custom
onboarding can explicitly record a payment with Cash/UPI, reference, and the
recording super admin. Subscription and positive-amount invoices are created
atomically, with discount applied across deposit then first-year fee.

Plan editing uses Charge deposit / No deposit radios; no-deposit saves zero.
Plans carry optional defaultTrialDays, used when switching a selected plan to
trial onboarding. The nullable defaultTrialDays and Store.accessGrantedUntil
columns were applied to Neon with additive migrate deploy (no reset). Existing
organization billing/history was not changed.

Super admins can set/extend trials and grant temporary access for up to 30 days.
Actions require super-admin auth, validate real dates server-side, record audit
activity, and revalidate organization screens. Temporary access clears payment
lapse for auth/read/write checks until expiry, but never bypasses locked or
archived status. Live trials also override an expired paid term consistently.
Creating an outlet now requires a current paid term, trial, or temporary grant;
the Outlets tab warns when absent. Never-started subscriptions remain readable
under existing auth behavior, while outlet creation is gated.

Onboarding phones validate 8–15 digits with optional formatting; owner names
require 2–100 characters and new owner passwords require at least eight
characters including a letter and a number. Employee optional phones and profile
name/phone validation are enforced in services. The pasted acceptance example
pass123 has only seven characters; pass1234 meets the stated policy.

RecordPaymentDialog uses organization terms for its initial renewal amount and
updates the amount when Deposit/Renewal changes; renewal success includes the
paid-through date. Both invoice modal previews render actual PDFs via PDF.js
canvas, with loading, retry/error, and Open PDF fallback. Print/download/share
continue using the original PDF URLs. The PDF.js worker is copied locally from
the installed package by postinstall, predev, prebuild, and vercel-build; it is
generated/ignored rather than checked in.

Verified: TypeScript, lint (two existing qa_audit warnings), 71 disposable-local-
Postgres integration tests including onboarding/payment/trial/access expiry and
lock/archive regressions. Authenticated browser: subscription invoice rendered;
renewal/deposit prefill; plan/custom/trial drafts and 30-day review; formatted org
phone accepted and abc rejected; no-deposit editor hides amount; 390px editor.
Browser drafts were discarded, with no QA organization, payment, or access grant
written to Neon. Creation/payment/access workflows were tested in isolated local
Postgres rather than changing the live organization.

Final production build, Prisma schema validation, and diff hygiene also passed.


### Owner feedback: Sales consolidation and corrections (2026-09-27)

Sales is the visible order workspace for owners and employees. Orders was removed
from desktop/mobile navigation; /admin/orders redirects to /admin/sales while
retaining query parameters and order drilldowns. Order HTTP APIs and invoice PDF
routes under /admin/orders/[orderCode] remain unchanged. Employees have New sale
and Sales register views in Sales; server-rendered employee records are scoped to
the currently authorized outlet. The verified-owner 60-second browser order cache
now runs in Sales, with server store-id matching before cache use.

Order details stack compact full-width delivery progress, a service/quantity/rate/
amount bill table and chronological status history. Invoice actions appear at the
end of the header only after delivery and full payment. Pieces/weight use validated
text fields with numeric/decimal keyboards to prevent native wheel/spinner steps.

Expenses now expose View/Edit/Delete on desktop rows and mobile cards. Owner-only
web actions verify tenant scope. Edits change one bill and retain its paid date;
monthly due dates remain in the original month. Confirmed deletion removes the
selected bill and deactivates its recurring series, preserving other recorded
occurrences. Recurrence generation and mutations serialize by store transaction
lock. Affected paid-date/outlet expense totals are recomputed from remaining bills,
including legacy data without existing rollups; other daily metrics stay intact.
No schema migration or new HTTP edit/delete route was added.

Employee lists expose a dedicated owner-only Reset password action. The service
checks employee membership, updates only passwordHash/credentialVersion and the
existing mustChangePassword flag, and revokes sessions in the transaction. Identity
and outlet grants remain unchanged. The existing mobile password-change flag
contract remains; this task did not add a web first-login password-change screen.

Verified: TypeScript, lint (two existing qa_audit warnings), 82 isolated local-PG
integration tests, five cache/payment-method unit tests and isolated production
webpack build. Authenticated owner desktop/mobile UI, unsaved quantity/customer
lookup draft, expense view/edit/delete review and password reset review inspected.
No live record deletion, password mutation or order submission; employee browser
login remains unverified. See QA-OWNER-FEEDBACK-REPORT.md for comment-level evidence.

### Invoice reuse and workspace density follow-up (2026-09-27)

Customer and subscription invoices share `src/lib/pdf/InvoiceLayout.tsx` for PDF
styles and a bounded two-column header. Their business document bodies remain
separate. All four PDF endpoints use `src/lib/pdf/response.tsx` to render and set
PDF headers; authentication, invoice settlement gates and token checks stay in
the original routes/services. PDF preview is defined once at
`src/components/PdfPreview.tsx`; print is at `src/lib/invoicePrint.ts`, and native
file/link/WhatsApp sharing is at `src/lib/invoiceShare.ts`. Weight service rates
show Slab pricing instead of an average unit rate. Long organization addresses
wrap within the header's brand column.

Order payment/status actions in Sales and the retained OrdersClient share
`useOrderMutation`: dialog-wide spinner overlay, inert content, duplicate-action
guard, action-result cache update and route refresh, with error recovery. Fresh
server snapshots supersede the acknowledged action result. This does not add an
offline write queue. Profile separates organization contact details, current owner
account and outlet contacts. Employees has one page heading with Add employee;
Expenses keeps date filters and Add expense together. Shared shell/card spacing
is tighter and the mobile dashboard topbar truncates a long outlet label within
the available width. Footer sizing follows the flex workspace shell.

### Customer invoice web preview (27 September 2026)

`/i/[token]/view` is a public read-only invoice preview page. It validates the existing 32-byte random invoice access token with `getOrderInvoiceByToken`, rejects missing/invalid invoices, and renders the shared `PdfPreview` from `/i/[token]`. Owner invoice Open and shared links use this page; Download retains the token-protected PDF endpoint. URLs contain no order or customer identifiers. Owner WhatsApp opens the web composer directly without a native share sheet; Super Admin controls are unchanged.


### Locked-store read-only workspace (27 September 2026)

Owner workspace server-rendered read pages explicitly opt into `allowLockedReadOnly`; organization membership, active membership, and role validation still apply. Archived stores remain blocked. The shared shell displays a non-dismissible Store locked / Read-only banner, while record browsing, filters, navigation and logout remain available. Mutation controls are disabled and mutation dialogs are suppressed. Default server session guards and `assertStoreWritable` retain lock enforcement; the read option must never be used for mutation authorization.

Announcements require `20260927180000_workspace_announcements`, applied to the configured shared database on 27 September 2026 after explicit user authorization. The editor page displays setup pending when the table is missing. The development Prisma singleton recreates a client that predates the new model after hot reload.


Migration verification: `prisma migrate deploy` successfully applied `20260927180000_workspace_announcements`; follow-up `prisma migrate status` confirmed all 16 migrations are applied. Live announcement publication/dismissal verification remains separate.

## Orders and sales route split (2026-09-27)

- `/admin/orders` is the dedicated service-selection/new-order route for owners and employees; it no longer redirects to Sales. `/admin/sales` is history with per-order amounts and detail dialogs, without aggregate metric cards or counter tabs. Navigation exposes both routes; existing role landing routes remain unchanged.
- Adding the first service reveals checkout beside the catalogue on desktop and before the catalogue on narrow screens. The large fixed View order bar is removed. Customer phone search reuses the tenant-scoped server action; customer name remains optional, followed by delivery and payment. Multi-outlet owners must choose an active outlet.
- Draft restoration runs once per user/store key rather than on each catalogue-method refresh. Locked stores cannot create orders; existing history remains readable.
- Verified employee browser flow: service selection, returning-customer lookup, delivery/payment review, desktop and 375px overflow check; no live order/payment submitted. TypeScript, scoped ESLint and all 89 disposable-Postgres integration tests pass.

### Full-width counter and compact-screen steps

Orders uses top navigation instead of the desktop sidebar. Services render as price-breakdown rows with selected quantities and service totals; checkout does not duplicate the items table. At widths up to 950px, Add starts customer entry, followed by service quantity selection and then payment. Step navigation supports revisiting customer/services/payment without discarding the draft. Quantity dialogs use text inputs with decimal/numeric keyboards and explicit quantity validation, avoiding native wheel-driven number changes. Received amount also uses a decimal text input with server-side/domain validation unchanged. Existing draft restoration selects the services step when the customer is already ready.

Browser verified desktop price list, no duplicate checkout items, unchanged weight after wheel scrolling, customer/services/payment navigation and 320/375px overflow checks. No live order or payment submitted.

### Compact catalogue and independent customer entry

The Orders catalogue uses smaller row spacing and typography; Clear belongs to its heading. Customer entry is rendered independently of selected services. The customer step has no order-total or Punch order control. Continuing with selected services opens delivery/payment; without services, checkout remains unavailable. Mobile step navigation uses the same guard. Verified an empty temporary draft, optional blank name, service quantity entry and the next payment screen with correct total; 375px has no horizontal overflow. No live order submitted.
