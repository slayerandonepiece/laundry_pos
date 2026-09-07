# Implemented state

Last reviewed: 2026-09-07. Describes the working tree; it does not assert these
changes are deployed to production.

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
- `prisma/seed.ts`: idempotent owner-account seed script (`npx prisma db seed`).

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
