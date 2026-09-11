# Mobile API — task list (Phase 1)

Audience: an agent implementing the HTTP API that the Flutter app
(`../laundry_pos_mobile`, working title "MyShop") will call. Read
`.agents/README.md` and `.agents/CURRENT-STATE.md` first — they are the
source of truth for this repo's conventions.

**Do Phase 1 completely before any Flutter work starts.** The app cannot
be built against Server Actions.

---

## Why this exists

Audited 2026-09-11 against a clean working tree. The backend has **no
external API surface at all**:

| Checked | Result |
| --- | --- |
| `src/app/api/**` | does not exist |
| route handlers in `src/app` | 3 total, all PDF renderers (`i/[token]`, two invoice PDFs) |
| `Authorization` / `Bearer` in `src/` | 0 matches |
| `middleware.ts` | does not exist |

Every read is a Server Component calling `src/server/services/*`
directly; every write is a Server Action. Server Actions are the React
Server Components wire protocol — an internal, unversioned encoding keyed
by a build-generated action id that changes on every build. A Flutter
client cannot treat it as a contract.

Auth is browser-only: `getSession()` (`src/server/auth/session.ts`) reads
an HttpOnly cookie via `cookies()`, so every guard below it is hard-wired
to a browser request. Store scoping rides on two more cookies
(`el_selected_store`, `el_dashboard_all_stores`) that carry UI state.

**The good news:** `src/server/services/*.ts` is already
framework-agnostic, zod-validated domain logic, and every function
already takes `storeId` as its first parameter. `requireStoreSession(storeId, role)`
already enforces role + membership-active + store-locked + archived +
payment-lapsed, live, on every call. This phase is a thin transport
adapter over existing logic — **not** a rewrite. Do not duplicate domain
logic into route handlers.

---

## B0 — Decisions required before coding

### B0.1 — `WorkStatus` vocabulary ⚠ BLOCKING

`prisma/schema.prisma:29` defines three statuses:

```prisma
enum WorkStatus { PENDING  IN_PROGRESS  COMPLETED }
```

The approved mobile designs use **four**: Pending → In progress → Ready →
Delivered. `Ready` and `Delivered` do not exist.

Two options — **ask the repository owner, do not choose unilaterally:**

- **(a) Extend the enum.** Add `READY` and `DELIVERED`, migrate
  `COMPLETED` → `DELIVERED`. Matches the designs exactly. Touches
  `admin.types.ts` (`WorkStatus`), the web workspace's status UI, and
  `OrderDeliveryDetails.tsx`.
- **(b) Keep three.** `Ready` and `Delivered` both collapse onto
  `COMPLETED`; the mobile 9-series loses a step and the invoice rule
  ("paid in full AND delivered") becomes "paid in full AND completed".

Whichever is chosen, record it in `.agents/CURRENT-STATE.md`.

### B0.2 — Employees collecting balances

`src/features/admin/actions/orders.actions.ts:25` gates
`recordPaymentAction` with `requireStoreSession(undefined, 'OWNER')`.

The designs (screen 9e) have **employees collecting a balance at
handover**. The owner has confirmed this flow in conversation. Relaxing
this guard is a deliberate permission widening — confirm before shipping,
and note it in `CURRENT-STATE.md`.

---

## B1 — Schema

- [x] **B1.1** Migration: `User.mustChangePassword Boolean @default(false)`.
  Set `true` in `resetUserPassword()` (`src/server/services/platform-users.ts`)
  and in the owner-facing employee password reset
  (`src/server/services/employees.ts`). Cleared when the user sets their
  own password. Today nothing tells the app to force a password change,
  so the designed "Set a new password" screen has no trigger.
- [x] **B1.2** Migration: `Session.token String @unique` — an opaque
  bearer token. **Reuse the existing pattern**, do not invent one:
  `OrderInvoice.accessToken` already stores 32 cryptographically random
  bytes as base64url. Copy that generation exactly. Backfill existing
  rows in the migration; a prior migration in this repo
  (`20260909133000_normalize_invoice_access_tokens`) exists precisely
  because a backfill produced a differently-shaped value than the route
  accepted — do not repeat that mistake.
- [x] **B1.3** *(only if B0.1 chooses (a))* Migration extending
  `WorkStatus`. Hand-edit the generated SQL to `ALTER TYPE ... ADD VALUE`
  plus a data update; Prisma's default diff for enum changes is
  destructive. There is precedent in this repo for hand-editing a
  generated migration for exactly this reason — see the `PaymentMethod`
  note in `CURRENT-STATE.md`.

Run migrations against the **dev** Neon branch only. Production's
migration history was squashed and is NOT reconciled — read the
"Critical caveat" in `CURRENT-STATE.md` before going near production.

---

## B2 — Authentication for non-browser clients

- [x] **B2.1** `src/server/auth/token.ts` — generate/verify opaque
  session tokens (32 random bytes, base64url).
- [x] **B2.2** Refactor `getSession()` in `src/server/auth/session.ts` so
  session resolution is **not** hard-wired to `cookies()`. Introduce
  `getSessionFromRequest(req: Request)`: read `Authorization: Bearer
  <token>` first, fall back to the cookie. Keep the existing
  cookie-reading `getSession()` intact so the whole web workspace keeps
  working — this must be additive.
  - Preserve every existing invalidation rule: expiry, `user.active`,
    and `credentialVersion` mismatch. Token auth must be revoked by the
    same mechanisms (`revokeAllSessionsForUser`, credential bumps).
- [x] **B2.3** `requireStoreSession` / `requireSuperAdmin` gain
  request-aware variants that take a resolved session rather than
  re-reading cookies. Do not fork the authorization logic — the lock /
  archive / membership / payment-lapse checks must stay in one place.
- [x] **B2.4** Mobile login/logout endpoints returning the token.
  `loginAction`'s existing behaviour (resolve `storeRole` from active
  memberships) is the model — see `src/server/auth/actions.ts`.
- [x] **B2.5** Login throttling. Currently absent and already flagged in
  `BACKEND-PLAN.md` §2. A public token endpoint makes it necessary.

---

## B3 — HTTP surface

- [x] **B3.1** `src/app/api/v1/**/route.ts`.
- [x] **B3.2** One shared handler wrapper: resolve auth → check role →
  zod-parse the body → call the service → JSON envelope. Error mapping:
  - `AuthError('UNAUTHENTICATED')` → **401**
  - `AuthError('FORBIDDEN')` → **403**, including `reason` in the body
    when present (`membership_inactive` / `store_locked` /
    `store_archived` / `payment_lapsed`) — the app renders a different
    blocking screen per reason
  - `ValidationError` (`src/server/errors.ts`) → **400** with the message
  - anything else → **500**, message not leaked
- [x] **B3.3** `storeId` becomes an explicit request parameter (header
  `X-Store-Id` or a path segment). **Never** read `el_selected_store` on
  an API route. The cookie is a browser UI hint, not authorization —
  `requireStoreSession` must still independently re-verify membership on
  every call, exactly as it does today.
- [x] **B3.4** `Cache-Control: private, no-store` on every API response.
- [x] **B3.5** CORS/`middleware.ts` — only needed if Flutter **web** is a
  target. Native iOS/Android does not enforce CORS. Confirm before
  building.

---

## B4 — Endpoints (full store-workspace parity)

Each maps to an existing service function. Keep handlers thin.

| Area | Service | Endpoints |
| --- | --- | --- |
| Auth | `src/server/auth/` | login, logout, session status, change password, **set password when `mustChangePassword`** |
| Memberships | `session.ts` | list caller's active stores (drives the store switcher) |
| Products | `products.ts` | list, save |
| Orders | `orders.ts` | list, create (**pass the client idempotency key through** — `Order.idempotencyKey` already exists), detail, update status, record payment |
| Order invoices | `order-invoices.ts` | get-or-create, PDF |
| Payment methods | `payment-methods.ts` | list, create, rename, set active |
| Expenses | `expenses.ts` | list, create, mark paid |
| Employees | `employees.ts` | list, create, update, toggle active |
| Profile | `profile.ts` | get, save, change password |
| Dashboard | `admin.analytics.ts` | reuse `dashboardData()` — **do not write new aggregation** |

- [x] **B4.1** Order creation must keep server-side price recomputation
  (`src/server/pricing.ts`). Never trust client-submitted line amounts.
- [x] **B4.2** Payment recording must keep the `SELECT ... FOR UPDATE`
  row lock inside its transaction.

---

## B5 — Behaviour changes the designs require

- [x] **B5.1** `getOrCreateOrderInvoice()` (`src/server/services/order-invoices.ts`)
  currently creates an invoice on **any** view request. Per the approved
  design it must **refuse** unless the order is paid in full **and**
  delivered (see B0.1 for what "delivered" means). Add a way for the
  order-detail endpoint to ask whether an invoice exists yet, so the app
  can show the locked state.
- [x] **B5.2** Relax `recordPaymentAction`'s owner-only guard — see B0.2.
  The equivalent API endpoint must allow `EMPLOYEE`.
- [x] **B5.3** Surface `mustChangePassword` in the session-status
  response so the app can force the reset screen.

---

## B6 — Tests

`BACKEND-PLAN.md` §5 is unstarted; do not treat lint as behavioural
validation. `npm run test:subscription-payments` is the existing pattern —
a real PostgreSQL cluster, not mocks (see `tests/README.md`).

- [x] **B6.1** Auth matrix: no token / expired / revoked / deactivated
  user / stale `credentialVersion` / wrong store / wrong role.
- [x] **B6.2** Each of the four `FORBIDDEN` reasons returns 403 with the
  right `reason`.
- [x] **B6.3** Idempotent order creation — same key twice, one row.
- [x] **B6.4** Concurrent payment cannot overpay.
- [x] **B6.5** Invoice refuses to generate before settlement (B5.1).
- [x] **B6.6** Cross-store isolation: a token for store A cannot read
  store B, even with `X-Store-Id` spoofed.

---

## Definition of done

- `npx tsc --noEmit` and `npm run lint` clean. The only pre-existing lint
  failures in this repo are `require()` warnings in
  `.cursor/hooks/graft-hooks.cjs` — unrelated, leave them.
- `npm run build` passes.
- The **web workspace still works unchanged** — this phase is additive.
  Verify a real login and a real order in the browser, not just types.
- `.agents/CURRENT-STATE.md` updated with what was built, what was
  decided (B0.1, B0.2), and what is still open.
