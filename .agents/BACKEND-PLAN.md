> 2026-09-26 working-tree update: login now uses normalized personal phone, replacing username. See CURRENT-STATE.md's "Phone login replacement" section for migration/backfill prerequisites and verification. Older username references below describe the historical implementation.

# Backend plan — same Next.js application

Status: **core migration complete** (2026-09-07). Every screen (Products, Sales,
Orders, Expenses, Employees, Profile, Dashboard) is server-backed by Postgres
(Neon) via Prisma 7, within this same Next.js repository — no separate backend
service. Stack decisions made: Neon Postgres (independent project, branch per
environment), Prisma 7 ORM, hand-rolled DB-backed sessions (no third-party auth
library), Server Actions for mutations, Server Components for reads. See
`CURRENT-STATE.md` for what's implemented and verified. What's left from this
plan is hardening (tests, CI/deploy pipeline, observability) — see section 5
below, mostly unchecked.

This plan covers the single-tenant backend only. The app is now mid-migration
to a multi-tenant platform (StoreOps) on top of it — schema, auth, and the
Super Admin onboarding UI are done; subscription-lock enforcement and invoice
generation are not yet built. See `CURRENT-STATE.md`'s "Multi-tenant
foundation" section for that work; it isn't tracked in this document.

## Proposed boundaries

- `src/server/`: server-only database client, session/authorization helpers,
  repositories and domain services, marked server-only where supported.
- `src/app/api/**/route.ts`: proposed HTTP boundary for client requests. Server
  Actions are also an option for forms; choose a consistent mutation approach.
- Server Components can read through the same services directly. Do not call
  this app's HTTP API unnecessarily from its own server render.
- Shared serializable DTOs and validation schemas contain no DB clients, secrets,
  password hashes or privileged profile data.
- `AdminProvider` ultimately holds UI state and server-fetched data, not a complete
  authoritative browser database. Retain components and replace container data
  access incrementally, showing loading, validation and failure states.

## Ordered implementation checklist

### 1. Persistence and data contracts

- [x] Select a persistent relational database (PostgreSQL) and a migration/query
  tool compatible with the deployment runtime. → Neon Postgres + Prisma 7.
- [x] Define migrations, constraints, indexes, connection handling. → `prisma/migrations/`;
  pooled connection (Neon adapter) for runtime, direct connection for migrations.
  `.env.example`/secrets-free template and a separate test environment are still
  open — only `dev`/`production` Neon branches exist so far.
- [x] Model users/credentials, sessions, store profile, products, pricing slabs,
  orders, order lines, payments, status/audit events, expenses, recurring
  expense series and individual occurrences. → see `prisma/schema.prisma`.
- [x] Keep a stable internal order ID and concurrency-safe human-readable order
  number. Enforce normalized username uniqueness. → cuid `id` + autoincrement
  `orderNumber` (displayed as `EL-<n>`); `username` unique + lowercased.
  Foreign-key/archive semantics for financial history: `onDelete: SetNull` on
  product/user references from order lines and status events (order lines snapshot
  name/price already, so a deleted product doesn't corrupt old orders) — full
  product/employee *archival* (vs. hard delete) was never exercised, since the UI
  only ever deactivates, never deletes.
- [x] Preserve historical product name, unit, quantity and price snapshots on
  order lines so catalogue changes do not rewrite old orders. → `OrderLine.name`/
  `.amount` are snapshotted at creation; verified a later price edit didn't
  change an existing order's line amount.
- [x] Use integer paise for money, `Decimal(10,3)` for weights. Store event
  timestamps in UTC (`StatusEvent.at`); order/payment/expense *dates* are stored
  as `@db.Date` (no time component) so they represent the Asia/Kolkata calendar
  day the client already computed, with no server-timezone conversion risk.
- [x] Demo fixtures are gone entirely, not just isolated — `seed()`,
  `withDemoHistory`, `withSeptemberDemoIncome` and the whole local `Store`
  mechanism were deleted along with the last screen's cutover (Dashboard).
  The only seed script now is `prisma/seed.ts`, which creates one real owner
  account from env vars and is never run automatically.

### 2. Authentication and authorization

- [x] Hand-rolled server session implementation (no third-party auth library —
  deliberate choice for a two-role, credentials-only app; see conversation
  history for the tradeoff). Passwords hashed with bcrypt (`src/server/auth/password.ts`);
  DTOs returned to the client never include a password or hash.
- [x] Server-validated sessions: `Session` row in Postgres, HttpOnly cookie
  (`Secure` in production via `NODE_ENV` check), `SameSite: lax`.
- [x] Sign-in/sign-out (`loginAction`/`logoutAction`), owner password change
  (`changePasswordAction`) with current-password verification. Session
  rotation on every login (new row each time). Login throttling and a
  password-reset-via-email flow are not implemented (no email delivery in
  scope; a locked-out owner currently needs direct DB access or a re-seed).
- [x] Authentication enforced on every server page read and every mutation —
  each `page.tsx` under `/admin/*` calls `requireSession()`/`requireSession('OWNER')`
  before fetching real data (falls back to an empty result on `AuthError`, never
  throws to a 500), and every Server Action re-checks independently. Signed-out
  users are still redirected client-side too (`AdminScreenContainer`), but the
  server-side check is what actually withholds data — verified: a page request
  with no/invalid session gets an empty list even if a client bypassed the redirect.
- [x] Owner/employee permissions enforced per operation, not just per route —
  e.g. `recordPaymentAction`/`saveProductAction` call `requireSession('OWNER')`
  specifically; `createOrderAction`/`updateOrderStatusAction` accept either role.
- [x] Sessions invalidated on deactivation or credential change
  (`revokeAllSessionsForUser`, bumps `credentialVersion`) — verified in the
  browser that a live session is force-logged-out, not just blocked on next
  login. Audit actors (`StatusEvent.byUserId`) always come from the server
  session, never a client-supplied name — verified an employee-created order's
  audit trail correctly attributes the employee, not the owner.
- [ ] CSRF/origin protections beyond Next's built-in Server Action origin check
  were not separately reviewed or hardened. Private-read cache-control headers
  were not audited either — worth a pass before any real production traffic.

### 3. Domain services and application endpoints

Actual shape ended up as Server Actions + Server Components, not a REST API
surface (see the "API pattern" decision in conversation history) —
`src/features/admin/actions/*.actions.ts` (mutations) and
`src/server/services/*.ts` (framework-agnostic domain logic, called directly
from both actions and Server Components). No `/api/*` routes were needed.

- [x] Every service validates its input with zod (`products.ts`, `orders.ts`,
  `expenses.ts`, `employees.ts`, `profile.ts`) — IDs, text lengths, dates,
  enums, quantities, monetary values. Pagination was not needed: list
  endpoints return the full table (small store, small dataset) and existing
  client-side filtering/pagination logic was reused as-is.
- [x] Order totals always recomputed server-side from live catalogue prices
  (`src/server/pricing.ts`, mirrors the client's slab-pricing formula);
  invalid/inactive services and non-integer piece quantities are rejected.
  Client-submitted line amounts are never trusted.
- [x] Orders, line snapshots, initial payment and first status event saved
  transactionally (`prisma.order.create` with nested writes). Idempotency via
  a client-generated key (`Order.idempotencyKey`, unique) — verified two
  identical submissions return the same order, one row in the database.
  Order numbering is a Postgres `autoincrement`, inherently concurrency-safe.
- [x] Payment recording: `SELECT ... FOR UPDATE` locks the order row inside a
  transaction *before* reading lines/payments, so the balance check can't race
  a concurrent payment — verified the server rejects an overpayment
  independent of the client. Payment-specific idempotency keys (for retrying
  a *specific* payment submission, distinct from order-creation idempotency)
  were not added — out of scope, flagged as a possible future addition.
  Refund/correction flows are not implemented (not requested).
- [x] Status transitions: validated against the `WorkStatus` enum, `completedAt`
  set/cleared accordingly, every change appends an immutable `StatusEvent` row
  attributed to the real session actor. Optimistic concurrency/version
  conflicts (two people updating the same order at once) are not specially
  handled — last write wins, judged acceptable for this store's scale.
- [x] Product/employee/profile/expense operations all go through their own
  service + Server Action, each independently `requireSession`-gated; there is
  no whole-store replacement endpoint (that mechanism doesn't exist anymore —
  see "Removed as part of the cutover" in `CURRENT-STATE.md`).
- [x] Recurring expenses generated server-side with a `(seriesId, periodMonth)`
  unique key, short-month clamping (`Math.min(dueDay, daysInMonth)`), safe
  on-demand generation on every `listExpenses()` call — verified idempotent
  under repeated calls and that paid occurrences are never touched.
- [x] Dashboard aggregation reuses the existing pure `dashboardData()` function
  fed from server-fetched lists — same date/accounting semantics as the rest
  of the UI by construction, not reimplemented. Bounded queries: not applied
  (fetches full lists), acceptable at current scale; would need revisiting if
  order volume grows substantially.

### 4. Frontend cutover and existing data

- [x] Storage hydration/mutations fully replaced with authenticated server
  reads/writes. Mutations use `router.refresh()` after a successful Server
  Action (re-runs the Server Component fetch) plus `revalidatePath`; failures
  set an error state and never silently report success.
- [x] The one in-browser draft that matters (an employee's in-progress POS
  cart) still uses `sessionStorage` deliberately — that's a per-device,
  short-lived UX convenience, not data of record, and was left as-is.
  Cross-tab/session-cookie behavior was tested and documented (see "browser
  tabs share one cookie jar" note in `CURRENT-STATE.md`/conversation history).
- [x] Demo credentials and browser-stored passwords/sessions are gone — not
  hidden, deleted (see "Removed as part of the cutover"). Auth failures return
  an empty result, never a silent fallback to fabricated data.
- [x] No browser prototype data existed worth importing (this was a fresh
  Neon database with no real customer history), so no import step was built.
  If this plan is reused on a deployment that *does* have real localStorage
  data, that import still needs to be designed — it was never in scope here.
- [x] Styling, navigation, role-specific screens and route behavior unchanged
  throughout — verified screen-by-screen in the browser after each cutover.
  The public website was already extracted to `../vendor_websites/express-laundry`
  before this backend work began and was not touched.

### 5. Tests, deployment and operations

Not started — this is what's actually left. Everything above (data model,
auth, domain services, frontend cutover) was verified manually in the browser
against the Neon dev branch throughout, but that's not a substitute for the
items below.


- [ ] Unit tests: pricing slab boundaries, weight precision, money rounding,
  balances, date ranges, status transitions and recurring expense idempotency.
- [ ] Integration tests: authentication/authorization matrix, inactive users,
  malformed requests, stale versions, concurrent orders/payments and transactions.
- [ ] Browser tests: login/logout/reload, owner/employee routing, order creation,
  payment recording, status updates, products, expenses and mobile workflows.
- [ ] Deployment: migrations, environment configuration, compatible DB connection
  pooling, HTTPS cookies, health checks, backup/restore and rollback procedure.
- [ ] Observability: structured errors/audit events with secrets and unnecessary
  customer details redacted; operational alerts and recovery instructions.

## Backend completion criteria

Two authorized browsers see the same durable store data; data survives application
restarts; a forged browser role/session cannot access protected data; unauthorized
mutations fail server-side; prices/payments remain consistent under concurrency;
production contains no automatic demo seeding or exposed credentials; critical
flows pass integration/browser tests and migration/backup/rollback are verified.

**Status against this bar**: the data/auth/consistency criteria are met and were
verified manually (durable Postgres data, session forgery correctly rejected,
server-side authorization independent of the client, transactional payment
consistency under a simulated concurrent-overpayment check, no demo seeding or
exposed credentials in the app). Not yet met: automated integration/browser
tests (none exist — all verification so far was manual, in-session), and
migration/backup/rollback procedures were never exercised (only forward
migrations were ever run, by hand, against a single dev branch — no rollback,
no production branch, no backup strategy defined). Treat this as functionally
complete but not yet production-hardened.
