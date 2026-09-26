# Multi-outlet implementation runbook

Status: **active planning and delivery document** (2026-09-14). Delete this
file only after every task below is implemented, independently verified, and
its enduring facts are folded into `CURRENT-STATE.md` and project memory.

## Non-negotiable product decisions

- `Store` is the temporary internal/database name for the future
  **Organization**. Do not rename it until a dedicated, fully-scoped task.
- Super admin creates organizations and outlets. Outlet IDs/codes are global,
  manually assigned, and immutable.
- Products and pricing are organization-wide. There is no per-outlet product
  availability or price override in this rollout.
- Owner payment-method enablement is organization-wide and appears at every
  outlet. Super admin owns the global catalogue. There is no QR/account/terminal
  integration now.
- Employees can use several outlets within one active organization. They choose
  an allowed outlet after login and on each later outlet switch, then sync that
  outlet's data. An employee cannot hold active employee access in two
  organizations.
- Owners default to **All outlets** reporting; employees only access the active
  outlet. Orders never change their originating outlet.
- One negotiated deposit and one trial/subscription due date apply per
  organization. Super admin manually decides a mid-term outlet's amount and
  activation. Expiry permits historical read/export only and blocks all writes.
- Staging will be reset and reseeded only in task B7, after explicit approval.
  Until then all migrations are additive and non-destructive.

## Working protocol

1. Gemini implements the tasks in the listed order. It must complete each task's
   acceptance work before continuing, but may continue to the next non-
   destructive task without waiting for Codex's interim review.
2. Gemini must keep a per-task report: exact changed files, migration SQL
   summary, checks run, and remaining limitations. It must not perform
   formatting sweeps, unrelated refactors, resets, or commits.
3. Codex performs the independent end-to-end review after the agreed sequence
   completes: `git diff`, migrations, tests, type checks, lint, and relevant
   live UI/API behavior. Do not trust Gemini's report alone.
4. Never commit without the user's specific approval. B7 remains blocked until
   the user explicitly approves the staging reset in the current conversation.
5. Prisma migrations are code. Test on an isolated Neon branch/direct
   non-pooler connection before production. Index every new foreign key and use
   composite indexes that match actual tenant/outlet query predicates.

## Ordered task queue

| Task | Scope | Status |
| --- | --- | --- |
| B1 | Additive organization/outlet/payment schema foundation | Completed & verified (migration `20260914005500_add_outlet_and_payment_foundation`) |
| B2 | Auth, login context, organization/outlet authorization | Completed & verified (tests pass in `tests/outlet-auth.integration.test.ts`) |
| B3 | Outlet-owning operational records and API/service migration | Completed & verified (migration `20260914011000_add_operational_outlet_ownership`, tests pass in `tests/outlet-operational.integration.test.ts`) |
| B4 | Global payment catalogue and organization enablement | Completed & verified (migration `20260914012000_add_payment_platform_method_id`, tests pass in `tests/platform-payment-methods.integration.test.ts`) |
| B5 | Organization trial/subscription restriction and notification data | Completed & verified (tests pass in `tests/subscription-restrictions.integration.test.ts`) |
| B6 | Daily outlet/service rollups and reconciliation | Completed & verified (migration `20260914013000_add_daily_outlet_summaries`, tests pass in `tests/dashboard-rollups.integration.test.ts`) |
| B7 | Explicitly-approved staging reset, seed data, acceptance tests | Blocked (requires explicit user approval) |
| W1 | Next.js super-admin organization/outlet controls | Completed & verified (2026-09-14) |
| W2 | Next.js owner/employee outlet-aware screens | Completed & verified (2026-09-14) — outlet switcher, dashboard/orders/expenses outlet filter, employee outlet assignment UI |
| M1 | Flutter login context, outlet picker, cache/sync partitioning | Pending |
| M2 | Flutter owner all-outlet screens and restriction UX | Pending |

## B1 — additive schema foundation

**Completed (2026-09-14).** Added `Outlet`, `OutletMembership`, `PlatformPaymentMethod`,
`OrganizationPaymentMethod`, `AuditLog`, `OutletStatus`, and nullable
`Subscription.trialEndsAt` to `prisma/schema.prisma`.
Generated additive migration `20260914005500_add_outlet_and_payment_foundation`.
Validation passed: `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`,
`npm run lint`. Zero destructive operations.

## B2 — auth and access context

**Completed (2026-09-14).**
- Added `OutletSession`, `AllowedOutlet`, and `SubscriptionAccessState` to `src/server/auth/session.ts`.
- Implemented `requireOutletSession` and `requireOutletSessionFromRequest` enforcing:
  - Outlet exists and is ACTIVE.
  - Caller has live active StoreMembership.
  - OWNER has access to all active outlets in store.
  - EMPLOYEE requires active `OutletMembership`.
  - Full organization status check (LOCKED, deletedAt, subscription/trial expiry).
- Added `resolveOutletIdFromRequest` (`X-Outlet-Id` header and `outletId` query param) and `requireApiOutletSession` in `src/server/api/handler.ts`.
- Extended `POST /api/v1/auth/login` response with additive `organizations` array (including `allowedOutlets`, `defaultOutletId`, `subscriptionState`) while preserving `stores` array.
- Enforced single active organization rule for `EMPLOYEE` role in `src/server/services/employees.ts`.
- Created `src/server/services/outlets.ts` with transactional `assignDefaultOutlet` and `assignEmployeeToOutlet`.
- Added 5 integration tests in `tests/outlet-auth.integration.test.ts` (19/19 tests passing across full test suite).


```text
Implement Backend Task B2 only in /Users/reddygona/Documents/skills/laundry_pos.

Preconditions: B1 is present and verified. Read AGENTS.md, .agents/README.md,
.agents/CURRENT-STATE.md, this runbook, and the relevant Next.js documentation.
Use the existing bearer/cookie session mechanism; do not fork auth logic.

Goal: add organization/outlet-aware access context while preserving current
Store-facing web behavior. `Store` remains the transitional organization name.

Change these areas:
- prisma/schema.prisma B1 entities; src/server/auth/session.ts:23-367;
  src/server/api/handler.ts:65-88; src/app/api/v1/auth/login/route.ts:16-83.
- Add focused server helpers that resolve a user’s active organization
  membership, allowed active outlets, default outlet, and subscription/trial
  access. Keep requireStoreSession working for untouched web callers.
- Add `requireOutletSession` / request-aware equivalent. It must validate that:
  the outlet exists, belongs to the requested Store/organization, the caller
  has a live active organization membership, and either owns that organization
  or has an active OutletMembership. Never trust a header by itself.
- Add an explicit `X-Outlet-Id` resolver without changing existing X-Store-Id
  behavior. Do not expose an All-outlets write context.
- Extend POST /api/v1/auth/login's response with an additive
  `organizations` array containing organization id/name, role, allowed active
  outlets (id/code/displayName), default outlet id, and blocked/trial state.
  Preserve the current `stores` response temporarily for Flutter compatibility.
- Enforce at service/admin mutation level that an EMPLOYEE cannot be activated
  in a second organization. Owners and super admins are exempt. Default outlet
  assignment/change must be transactional; no employee can finish with two
  active default outlets in an organization.
- Do not route existing orders/expenses/products through outlets yet. Do not
  change current UI, existing StoreMembership semantics for legacy callers, or
  payment methods in B2.
- Update tests for cross-organization denial, unauthorized outlet spoofing,
  owner-all-outlet read eligibility, multi-outlet employee context, and default
  outlet uniqueness. Update CURRENT-STATE factually.

Run prisma validate/generate, tsc, lint, and focused API integration tests.
Do not run destructive database commands or commit.
```

## B3 — operational ownership and outlet-aware APIs

```text
Implement Backend Task B3 only after B2 is verified.

Goal: make every new operational write and read outlet-owned without changing
historical order ownership or allowing an employee to cross outlet boundaries.

Read the source before editing: prisma/schema.prisma Order/Product/Payment/
Expense models; src/server/services/orders.ts, expenses.ts, products.ts,
order-invoices.ts; src/app/api/v1/orders/**; src/server/api/handler.ts.

- Add organizationId and outletId to Order, Payment, Expense,
  RecurringExpenseSeries, OrderInvoice, StatusEvent, and any sync entity that
  creates/replays an operational write. Add indexes for the actual lookups,
  especially (organizationId, outletId, business/date column) where queried.
- Product/service ownership becomes organization-level (`storeId` is the
  transitional organization key). Do not add outlet product overrides.
- Backward compatibility until B7: new nullable fields and controlled service
  behavior are acceptable; do not reset data. Every newly-created operational
  record must have a valid authorized outlet and matching organization.
- Change the mobile API endpoints and service signatures to take an outlet
  context, not a raw untrusted ID. Existing web routes may retain legacy
  organization behavior only where required for transition; document each.
- Orders retain their originating outlet permanently. Payment, invoice, and
  status updates must validate that same outlet. Preserve price recomputation,
  order/payment idempotency, row locks, invoice settlement/delivery rules, and
  IST calendar dates.
- Partition bulk/delta sync by outlet. Do not leak cached or queued operations
  between outlets.
- Add integration tests for cross-outlet denial, owner selected-outlet access,
  employee-only allowed outlets, offline retry idempotency, and receipt outlet
  ownership. Update CURRENT-STATE.

Validate migration SQL, prisma validate/generate, tsc, lint, build if route
contracts changed, and focused API tests. No reset, no commit.
```

## B4 — global payment catalogue

```text
Implement Backend Task B4 only after B3 is verified.

Goal: replace per-Store free-text payment configuration with super-admin global
payment methods and one organization-wide owner enablement setting.

Relevant current code: prisma/schema.prisma:46-51 and 306-320;
src/server/services/payment-methods.ts; src/server/services/orders.ts:510-587;
payment-method API routes and super-admin services/actions.

- Super admin alone can create, rename, activate, and deactivate
  PlatformPaymentMethod rows. Normalize/validate immutable codes.
- Owner can only enable/disable an existing platform method for their own
  organization using OrganizationPaymentMethod. The setting applies to every
  outlet; do not introduce outlet-specific toggles or QR credentials.
- Payment creation receives a platform method id/code, validates it is active
  globally and enabled for the organization, and stores immutable display/code
  snapshots for historical receipts and reports.
- Preserve historical StorePaymentMethod and Payment.method data until B7;
  provide a safe transition path but do not destructively rewrite records.
- Add super-admin, owner, and employee authorization tests; test that a disabled
  method cannot be recorded and that global reports can group by method.
- Update CURRENT-STATE. Run migration safety review, prisma validation,
  generate, tsc, lint, build/API tests. No reset or commit.
```

## B5 — trial, subscription, and write restriction

```text
Implement Backend Task B5 only after B4 is verified.

Goal: one organization-wide trial/subscription state with a read-only expiry
restriction enforced in every server write path.

Relevant code: src/server/auth/session.ts:151-214 and 330-367;
src/server/services/stores.ts:41-91 and 289-337; subscription actions/routes.

- Compute access from trialEndsAt and paidThroughDate. Surface ACTIVE, TRIAL,
  TRIAL_ENDING, SUBSCRIPTION_ENDING, and RESTRICTED in login/context responses.
- A due date applies to all outlets. Super admin can create trial, extend trial,
  record renewal, and manually control a mid-term outlet activation/billing
  note. Do not automate proration.
- A restricted organization may read/export historical data but cannot create,
  modify, sync, collect payment, add staff, change settings, or otherwise write.
  Enforce in service/route guards, not just UI.
- Add a super-admin query/data source for subscriptions expiring within 30 days.
  Do not implement outbound email/push without a separately chosen provider.
- Preserve existing subscription invoice locking/concurrency behavior.
- Add tests for trial expiry, subscription expiry, read allowed/write denied,
  renewal restoration, and all-outlet scope. Update CURRENT-STATE.
```

## B6 — dashboard rollups

```text
Implement Backend Task B6 only after B5 is verified.

Goal: avoid scanning all raw records for week/month/quarter/year reporting.

Create additive daily aggregate tables for outlet KPIs and outlet-service sales,
each keyed by organization, outlet, and local IST business date. Include
indexes matching organization/all-outlets and outlet/range queries. Raw orders,
payments, and expenses stay authoritative.

- Update rollups transactionally and idempotently on order creation/status
  change/cancellation, payment collection, and expense paid/create flows.
- Handle retries without double counting. Preserve row locks on payments.
- Provide owner all-outlets and selected-outlet read services; employee reads
  only active outlet. Super admin can group across organizations/outlets.
- Add a protected reconciliation/rebuild service for a specified organization,
  outlet, and date range. It must recompute from source records and be audited.
- Do not move dashboard UI in this task. Add integration tests proving rollups
  equal source-of-truth totals and retries do not inflate totals.
- Review query plans/indexes using production-like data before claiming
  performance gains. Update CURRENT-STATE.
```

## B7 — staging reset and acceptance

```text
Do not start B7 without explicit user approval in the current conversation.

After approval: back up any required fixtures, reset only the confirmed staging
database using the direct Neon migration/admin connection, clear mobile caches
and offline queues, then seed One Wash Laundry with OBLRCHN01, OBLRCHN02, and
OBLRMTH01 plus owner, single-outlet employee, multi-outlet employee, payment
methods, orders, payments, and expenses. Run the complete backend acceptance
matrix in this runbook. Never target production.
```

## Client tasks

W1/W2 and M1/M2 may start only after their required backend contract is tested.
For mobile work, load the relevant Flutter architecture, HTTP, widget-test, and
integration-test skills. For web work, load the Next.js skills and this repo's
AGENTS.md. Client prompts must explicitly preserve server authorization as the
source of truth and must run the existing test/analyze suites plus a live check.

## Completion and cleanup

When the final task is verified: update `CURRENT-STATE.md` with actual behavior,
replace this document with a short permanent architecture section if useful,
then delete this runbook. Update project memory with the finished architecture,
verification baseline, commits, and remaining gaps. Do not delete it earlier.
