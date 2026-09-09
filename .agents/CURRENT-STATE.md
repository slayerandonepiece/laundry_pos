# Implemented state

Last reviewed: 2026-09-08. Describes the working tree; it does not assert these
changes are deployed to production.

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
- **Super Admin UI**: built and verified. `/super-admin/login` (separate from
  the store app's `/login`, cross-linked both ways), `/super-admin` (dashboard:
  store counts, needs-attention list), `/super-admin/stores` (directory + a
  real 4-step onboarding wizard — store details, new-or-existing owner,
  subscription terms, review). Onboarding a store transactionally creates the
  `Store`, `Subscription`, owner `User`+`StoreMembership`, and — if "deposit
  and first year received" is checked — two `SubscriptionPayment` rows
  (deposit + first-year renewal) with sequential invoice numbers, and sets
  `paidThroughDate` to one year out. Verified in the browser end-to-end,
  including logging in as a freshly-onboarded owner and confirming their store
  shows zero orders — full tenant isolation from the migrated store.
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
  `OnboardingWizard.tsx`'s subscription step now forks between "Use a plan"
  and "Custom terms" (confirmed both must coexist, not a replacement).
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

- **Auth**: sign-in (`/login`, for owner and employee) creates a real server-side
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
| `/super-admin/login` | Platform-admin sign-in, separate from `/login` (cross-linked both ways) |
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
  guards, and the mutation handlers that call the Server Actions above.
- Other `containers/`: employee counter, order and product editor state.
- `src/features/admin/components/`: presentation, forms, tables, charts, dialogs.
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
  `requireSuperAdmin()`-gated), `components/` (`SuperAdminShell` — the app
  frame: sidebar/topbar/mobile drawer, `hidePhead` escape hatch for pages that
  render their own header, `Icon` — shared SVG icon set for the `.soa` design
  system, `RowMenu` — shared row-action dropdown, `SuperAdminLoginForm`,
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
  (`SuperAdminPageShell` — passes `title`/`subtitle`/`breadcrumb`/`action`/
  `hidePhead` through to `SuperAdminShell`, plus the platform-admin logout
  handler, `StoresScreenContainer`, `UsersScreenContainer`,
  `PlansScreenContainer`, `BillingScreenContainer`), `types.ts`.
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
