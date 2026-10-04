# Mobile API contract (`/api/v1/**`) — backend-authoritative

Last verified **2026-09-26** against this working tree, not from memory.
Gates run at that point: `npx tsc --noEmit` 0 errors, `npm run lint` 0
errors, `npm run build` passes, integration suite **46/46 pass**
(`LC_ALL=C npm run test:subscription-payments`).

Audience: whoever builds the Flutter client in `../laundry_pos_mobile`.
That repo cannot see this code, so this file is the contract. Where it
disagrees with the running code, the code wins — every claim carries a
`file:line` so you can check.

Companion: `../laundry_pos_mobile/docs/OUTLET-PARITY-SPEC.md` (the
client-side plan). This file is *what the server does*; that file is
*what the app should do about it*.

---

## 0. What changed on 2026-09-26

Five backend changes, all in this tree, all covered by tests.

| # | Change | Files |
| --- | --- | --- |
| 1 | `GET /api/v1/payment-methods` now returns **organization** methods, not the legacy per-store list. `POST` is retired (410). | `src/app/api/v1/payment-methods/route.ts` |
| 2 | `PATCH /api/v1/payment-methods/{id}` toggles organization enablement by platform-method id. Renaming is rejected (400). | `src/app/api/v1/payment-methods/[id]/route.ts` |
| 3 | Bulk sync files **each queued order against its own `payload.outletId`**, instead of the single header outlet. | `src/server/services/orders.ts:528` |
| 4 | `POST /api/v1/orders` rejects a header/body outlet conflict with 400 instead of silently preferring the header. | `src/app/api/v1/orders/route.ts` |
| 5 | `GET /api/v1/auth/status` and `GET /api/v1/memberships` now carry outlet context, so a cold start no longer needs a fresh login to learn the caller's outlets. | `src/server/api/membership-context.ts` |

Plus one error-handling fix: an invalid/foreign `outletId` returned
**500**; it now returns **400 "Invalid outlet."**
(`src/server/api/handler.ts`).

New tests: `Task C` in `tests/mobile-api.integration.test.ts`, `B3.5`
and `B3.6` in `tests/outlet-operational.integration.test.ts`.

> **Running the suite on macOS.** `npm run test:subscription-payments`
> fails to boot its disposable cluster on PostgreSQL 18 with
> *"postmaster became multithreaded during startup"*. Prefix with
> `LC_ALL=C LANG=C`. This is a host/toolchain issue, not a repo bug.

---

## 1. Transport

Base: `<origin>/api/v1`. Every response carries
`Cache-Control: private, no-store`.

| Header | When | Meaning |
| --- | --- | --- |
| `Authorization: Bearer <token>` | every authenticated call | 43-char base64url session token from login |
| `X-Store-Id: <storeId>` | when the user belongs to >1 store | which organization; also accepted as `?storeId=` |
| `X-Outlet-Id: <outletId>` | see §3 | which outlet; also accepted as `?outletId=` |

`resolveOutletIdFromRequest` prefers the header, then the query param
(`src/server/api/handler.ts:88`). **Omitting the outlet is meaningful** —
for an owner it means "the whole organization". Never send an empty
string.

### App-update advisory (added 2026-10-04)

Request headers the app sends on every call: `X-App-Platform` (`ios` |
`android`), `X-App-Version` (semver name, e.g. `1.0.0`), `X-App-Build`
(integer; ignored by the server). Builds 1.0.0+1 and 1.0.0+2 send none.

Every `/api/v1` response — success, 304/204 and errors (401/403/429/500…)
— carries `X-Update-Level: none | soft | urgent`, except from an instance that
has not loaded its settings yet (a cold start or an unreachable database),
which sends **no update headers at all**: a missing header means "no
information", never "none", and the app keeps what it already knows. When the
level is `soft` or `urgent` the response also carries `X-Update-Min-Version`,
the minimum version behind that level, so the app can double-check against its
own installed version and ignore the level if it is already at or above it.
Per platform:
version < `urgentMinVersion` -> `urgent`; else version < `softMinVersion` ->
`soft`; else `none`. Only the version name is compared (numerically, so
1.10.0 > 1.9.0; equal to the minimum is *not* below it; `1`/`1.2` mean
`1.0.0`/`1.2.0`). Missing or unparsable headers (including `1.0.0+2` or
pre-release suffixes), an unknown platform, or unset config give `none` (with no
`X-Update-Min-Version`).

It is advisory only: it never changes a status code or body, never rejects a
request, and any failure computing it means no headers. Implemented once in
`handleApiRoute` (`src/server/api/handler.ts`); pure logic in
`src/server/app-update.ts`. A route that bypasses `handleApiRoute` would miss
the header — there are none today, and unmatched `/api/v1/*` paths (Next.js
404) do not carry it. Thresholds live in the `app_update_settings` table
(one row per platform, both columns nullable = unset), edited by Super Admin
at `/super-admin/app-updates`; each server instance answers from an in-memory
snapshot and refreshes it after a response is sent (at most every 15 s, one
shared lookup, last good value kept on failure; a brand-new instance reports
`none` until its first refresh). A change applies within about 15 s without a
redeploy; the instance that handled the save sees it immediately.

### Errors

```jsonc
{ "error": "<message>" }                       // 400 / 404 / 410
{ "error": "Unauthorized" }                    // 401
{ "error": "Forbidden", "reason": "<reason>" } // 403
{ "error": "Internal server error" }           // 500 — never show verbatim
```

`reason` is one of `membership_inactive`, `store_locked`,
`store_archived`, `payment_lapsed`, `must_change_password`,
`deletion_pending` (see "Account deletion" below) — or absent,
which means a plain role/outlet denial. Zod failures add an `issues` array.

`must_change_password` (403): while `user.mustChangePassword` is true the
session may only call `POST /auth/set-password`, `POST /auth/change-password`,
`POST /auth/logout` and `GET /auth/status`; every other authenticated route
answers 403 with this reason. Login -> `set-password` (returns a fresh
token) -> normal use is unchanged. A client that reaches this 403 should
route to the set-password screen, not to a "blocked" screen.

Messages safe to show the user verbatim are whitelisted in
`formatApiError` (`src/server/api/handler.ts:50`); anything else is
flattened to "Internal server error". Two you will meet:
`"That payment method is no longer available."` and
`"Invalid outlet."`

The same whitelist (`src/server/api/public-errors.ts`) applies to each
bulk-sync action's `error`: anything not whitelisted is returned as
`"Unexpected error."` (the original is logged server-side only).

---

## 2. Sign-in and outlet context

`POST /api/v1/auth/login` — `{phone, password}` (the body field is
`phone`; sending `username` fails validation with 400). 401 on bad
credentials, **429** with a retry message after 5 failures in 15 minutes
per IP/username. Missing and inactive accounts cost the same time as a wrong
password. `POST /auth/change-password` is throttled the same way per user:
after 5 wrong `oldPassword` guesses in 15 minutes it answers **429** with a
`Retry-After` header (seconds) until the block expires, even for the right
password; a success clears the counter.

```jsonc
{
  "token": "…",
  "user": { "id", "name", "username", "isSuperAdmin", "mustChangePassword",
            "deletionScheduledFor"? /* ISO; present only while a deletion request is PENDING */ },
  "stores": [ { "storeId", "storeName", "role", "status", "isLocked",
                "blockedReason", "paidThroughDate", "trialEndsAt",
                "subscriptionState",
                "allowedOutlets", "defaultOutletId" } ],
  "organizations": [ { "id", "name", "role", "status", "isLocked",
                       "blockedReason", "paidThroughDate", "trialEndsAt",
                       "subscriptionState",
                       "allowedOutlets", "defaultOutletId" } ]
}
```

`GET /api/v1/auth/status` returns the same `user` + `stores` +
`organizations` (no token). `GET /api/v1/memberships` returns the
`stores` array alone. All three are built by one helper
(`src/server/api/membership-context.ts`), so the shapes cannot drift.

Both `stores[]` and `organizations[]` include `trialEndsAt` (ISO date string
or `null`) and `subscriptionState` (one of `ACTIVE`, `TRIAL`, `TRIAL_ENDING`,
`SUBSCRIPTION_ENDING`, `RESTRICTED`) alongside `paidThroughDate` and
`blockedReason` (`membership_inactive` | `store_locked` | `store_archived` | `payment_lapsed` | `billing_pending` | `deletion_pending` | `null`), enabling mobile clients to build real trial/renewal banners
directly from `stores[]`.

When an organization has neither `trialEndsAt` nor `paidThroughDate` (created but never billed / terms not set), has no active `accessGrantedUntil` override, and is not locked/archived:
- Gated behind env flag `MOBILE_BLOCK_TERMS_NOT_SET` (default: `false`).
- When `MOBILE_BLOCK_TERMS_NOT_SET=true`: returns `blockedReason: 'billing_pending'` and `subscriptionState: 'RESTRICTED'`. Administrative `store_locked` and `store_archived` retain precedence.
- When the flag is `false` (default): returns `blockedReason: null` and `subscriptionState: 'ACTIVE'` (legacy behaviour).
- **Billing URL Path**: Currently, no self-serve web billing/checkout route exists for store owners in the web application (owners have no payment URL path to "Complete payment"). Subscriptions and terms are configured by platform Super Admins in the platform super-admin console.

`allowedOutlets[]`:

```jsonc
{ "id", "outletCode", "displayName", "isDefault", "status": "ACTIVE" }
```

- **OWNER** — every `ACTIVE` outlet, oldest first. `isDefault` is just
  "first in the list", not a stored preference.
- **EMPLOYEE** — only outlets with an active `OutletMembership`, default
  first. **Can be empty**, and such an employee cannot transact at all
  (see §3).
- Never contains a non-`ACTIVE` outlet, so no client-side filtering.

Source: `resolveAllowedOutlets`, `src/server/auth/session.ts:574`.

---

## 3. Outlet rules — read this before writing any order code

### 3.1 Who must send an outlet

| Route | OWNER | EMPLOYEE |
| --- | --- | --- |
| `GET /api/v1/orders` | optional (omit = whole org) | **required → 403** |
| `POST /api/v1/orders` | optional | **required → 403** |
| `GET /api/v1/orders/sync` | optional | **required → 403** |
| `POST /api/v1/orders/bulk-sync` | optional | **required → 403** |
| `GET /api/v1/dashboard` | `?outletId=` only | route is OWNER-only |
| `GET /api/v1/dashboard/rollups` | optional | **required → 403** (also 403 with zero outlet grants; `expensesAmount` is omitted from employee rows) |
| `GET,POST /api/v1/expenses` | optional | route is OWNER-only |
| `GET/PATCH/POST /api/v1/orders/{code}/**` | ignored | ignored — see §3.2 |
| everything else | n/a | n/a |

The employee gate is deliberate, quoted from
`src/app/api/v1/orders/route.ts:33`: *"Never silently fall back to a
default outlet: employees must name the active outlet for every
operational read, preventing legacy/null data from leaking into an
outlet-scoped mobile cache."* It is not going to be relaxed — **an
employee client that does not send `X-Outlet-Id` cannot list or create
orders at all.**

`/api/v1/dashboard` reads `?outletId=` directly
(`src/app/api/v1/dashboard/route.ts:15`) and **ignores the header**.
Build it into the URL.
- **Query parameters**:
  - `outletId`: optional outlet filter.
  - `period`: optional (`month` default, `week`, `quarter`, etc.).
  - `from`, `to`: optional explicit date range (`YYYY-MM-DD`).
  - `granularity`: optional `day` | `week` | `month`.
    - `day`: 1 bucket per day over the requested range.
    - `week`: Monday-start weeks clipped to the range (single-day uses `dateLabel`, multi-day uses `<from>–<to>`).
    - `month`: calendar months clipped to the range.
    - When present, `bars` is bucketed with the requested granularity, and an additive key `cashRange` (`{ label, income, expenses }[]`) is returned covering the requested range with the same granularity. `cash` remains untouched (5 buckets across the current calendar month).
    - If `granularity` is invalid, returns `400 Bad Request`.
    - When `granularity` is absent, legacy behavior is preserved byte for byte (`cashRange` is omitted, `bars` has up to 12 intervals).

### 3.2 Per-order routes need no outlet

`/orders/{code}`, `/orders/{code}/payments`, `/orders/{code}/status`,
`/orders/{code}/invoice` and `/orders/{code}/invoice/pdf` derive the outlet
from the order row itself and check the employee's membership against *that*
(`assertCanReadOrderInvoice`; the web `/admin/orders/{code}/invoice/pdf`
route applies the same rule — order codes are sequential, so this was a
cross-outlet read before 2026-09-30). Sending `X-Outlet-Id`
changes nothing. An employee reading an order from another outlet gets
403; so does any employee reading an order with no outlet at all.

### 3.3 Precedence, and the fallback that surprises people

`createOrder` resolves the outlet as
`explicitOutletId ?? data.outletId ?? <oldest ACTIVE outlet of the store>`
(`src/server/services/orders.ts:320`).

Two consequences:

1. **The header beats the body.** As of change #4 a conflict is a 400
   rather than a silent win, but where only one is present, that one is
   used.
2. **An order with no outlet anywhere is auto-assigned to the
   organization's oldest active outlet — it does not become
   organization-wide.** Every order the current mobile app has ever
   created went there. This is pre-existing behaviour and was *not*
   changed in this pass: changing it would re-attribute historical data
   and affect the web workspace too. Treat it as a product decision
   still open, and always send an outlet explicitly so it never applies.

Reading is different from writing: an order whose stored `outletId` is
null **is** organization-wide, and the workspace labels it exactly
`Organization-wide`. `Order.outletId` is optional in the DTO and there
is **no outlet display name on the order** — resolve it from
`allowedOutlets`.

### 3.4 Offline batches

`POST /api/v1/orders/bulk-sync` now uses each action's own
`payload.outletId`, falling back to the request outlet only when the
payload has none (`src/server/services/orders.ts:528`). So an owner may
flush orders from several outlets in one call.

An **employee** still may not: the route rejects the whole batch with
403 if any `create_order` names an outlet other than the request's
(`src/app/api/v1/orders/bulk-sync/route.ts:26`). One request per outlet
is the safe pattern for both roles.

`GET /api/v1/orders/sync` filters by outlet, so its cursor is only
meaningful within one scope. Key the cursor by outlet client-side.

#### 3.4a What a mobile client syncs at sign-in, per role (added 2026-09-30)

No new endpoint or field — this fixes the expected client behaviour on
top of the outlet rules above.

- **OWNER** — after sign-in the app pulls **every** outlet in
  `allowedOutlets`, one request set per outlet (`X-Outlet-Id` /
  `?outletId=`): `orders/sync` (own cursor), `dashboard`, `expenses`;
  plus the combined "all outlets" scope with no outlet sent. Org-wide
  data (store details, products, payment methods, staff) once. Every
  outlet is then usable offline and switching is instant; nothing is
  cleared on a switch.
- **EMPLOYEE** — the app syncs **only the selected outlet** (sole
  allowed, remembered, or picked when there are several). Switching
  outlet clears the previous outlet's cached orders/cursor and syncs the
  newly selected one. Queued offline actions are never cleared; each
  keeps its own `payload.outletId` and flushes to that outlet (one
  `bulk-sync` request per outlet).
- Server side: an employee naming an outlet they have no membership for
  still gets 403 / `"Invalid outlet."` — the client must not "pre-sync"
  outlets the employee is not assigned to.

### 3.5 Two ids per order: `id` and `offlineId`

- `id` is the server order code (`EL-123`). `offlineId` is a client-generated
  id, unique per organization, set only for orders created in the app;
  web-created orders have none (the field is omitted).
- `create_order` payloads may carry `payload.offlineId`. A retry with the same
  `offlineId` returns the existing order instead of creating a second one,
  including when two retries arrive at the same time.
- `offlineId` is trimmed, at most 64 characters, and must not look like an
  order code (`EL-<n>`) — that is a 400. Use a UUID.
- `update_status` / `record_payment` `orderRef` may be an `EL-` code or an
  `offlineId`, including one whose `create_order` synced in an earlier request.
  `orderRef` and `offlineCode` are trimmed.
- In bulk-sync, an employee's `update_status` / `record_payment` on an order
  at an outlet they are not granted comes back `failed` with
  `"You don't have access to this order's outlet."` — the same rule as the
  single-order status and payment routes. Other actions in the batch still run.
- A payment `clientActionId` already recorded on a different order is
  rejected (`"That payment was already recorded on another order."`); a
  replay on the same order returns it unchanged.
- A `create_order` whose `idempotencyKey` / `offlineId` matches an existing
  order at a *different* outlet than the one the request names (header for
  `POST /orders`, `payload.outletId` or the request outlet for bulk-sync)
  fails with `"Order not found."` instead of returning that order. A retry
  for the same outlet (or an owner naming no outlet) still returns the
  existing order.
- Every order response includes `offlineId` (when set), and each payment
  includes the `clientActionId` it was recorded with (when set), so the client
  can match its offline payments exactly.

---

## 4. Payment methods — the rule that breaks checkout if you get it wrong

### 4.1 The rule

`resolveActivePaymentMethod(storeId, method, { allowLegacy })` matches on
**id, code, or case-insensitive name**, and requires an
`OrganizationPaymentMethod` that is `enabled` for this store on a
currently-`active` `PlatformPaymentMethod`
(`src/server/services/platform-payment-methods.ts:194`).

`allowLegacy` is not something you pass — it is derived:

| Operation | `allowLegacy` |
| --- | --- |
| `createOrder` | `!data.outletId && !explicitOutletId` (`orders.ts:310`) |
| `recordPayment` | `!order.outletId` (`orders.ts:670`) |

Because of the §3.3 fallback, almost every order already *has* an
outlet, so **collecting a balance already requires an enabled
organization method today** — before any client change.

### 4.2 The endpoints

| Route | Role | Behaviour |
| --- | --- | --- |
| `GET /api/v1/payment-methods` | any member | enabled organization methods |
| `GET /api/v1/payment-methods?all=true` | any member | all, enabled and disabled — for the owner's settings screen |
| `PATCH /api/v1/payment-methods/{id}` | OWNER | `{"enabled": bool}` (`active` accepted as an alias). `{"name": …}` → 400 |
| `POST /api/v1/payment-methods` | — | **410 Gone** |

Response item: `{ "id", "code", "name", "enabled" }`. `id` is the
**platform method id** — the same id `PATCH` takes. Submit the `name`
verbatim as the order's payment method.

Creating and renaming belong to the platform catalogue (Super Admin).
An owner only enables or disables. **The mobile "Add payment method" and
"Rename" screens are now obsolete** and must be removed — the endpoints
behind them no longer exist in that form.

### 4.3 Live data, so you can calibrate the risk

Dev database, 2026-09-26:

| Store | Legacy (previously returned) | Enabled organization methods |
| --- | --- | --- |
| Reddy's Laundry | Cash, UPI | Card, COD, Cash, Upi |
| One Wash | Cash, UPI | **(none)** |

So a hardcoded `"Cash"` / `"UPI"` happens to resolve for Reddy's
Laundry by case-insensitive name, and **fails for every prepaid order
and every balance collection at One Wash**. No API change fixes One
Wash — its owner must enable a method in Profile → Payment methods.
What change #1 buys you is an honest empty list at checkout instead of a
rejection after the customer has paid.

Handle the empty list explicitly: disable prepaid options and say
*"No payment methods are enabled. Ask the owner to enable one in
Profile → Payment methods."* Never fall back to a literal `"Cash"`.

### 4.4 Payments are irreversible

There is **no void, refund, delete or correction path anywhere** in the
services — `BACKEND-PLAN.md` lists it as a known gap. A recorded payment
can only be undone with direct database access. Design the client so a
payment is never recorded without an explicit user action: do not
pre-select a payment method at checkout.

---

## 5. Endpoint inventory

Every route under `/api/v1`. "Outlet" = does it read `X-Outlet-Id`.

| Route | Methods | Role | Outlet |
| --- | --- | --- | --- |
| `/auth/login` | POST | public | — |
| `/auth/logout` | POST | any | — |
| `/auth/status` | GET | any | — |
| `/auth/change-password` | POST | any | — |
| `/auth/set-password` | POST | any (`mustChangePassword`) | — |
| `/account/deletion` | POST | any (works while deletion is pending) | — |
| `/account/deletion/restore` | POST | any (works while deletion is pending) | — |
| `/memberships` | GET | any | — |
| `/products` | GET / POST | any / OWNER | no |
| `/orders` | GET / POST | any | **yes** (§3.1) |
| `/orders/sync` | GET | any | **yes** |
| `/orders/bulk-sync` | POST | any | **yes** |
| `/orders/customer-lookup?phone=` | GET | any | no — see below |
| `/orders/{code}` | GET | any | derived from order |
| `/orders/{code}/status` | PATCH | any | derived from order |
| `/orders/{code}/payments` | POST | any (owner **and** employee) | derived from order |
| `/orders/{code}/invoice` | GET | any | derived from order |
| `/orders/{code}/invoice/pdf` | GET | any | derived from order |
| `/payment-methods` | GET / POST | any / **410** | no |
| `/payment-methods/{id}` | PATCH | OWNER | no |
| `/expenses` | GET / POST | OWNER | optional |
| `/expenses/{id}` | PUT / DELETE | OWNER | body outletId only for PUT |
| `/expenses/{id}/pay` | POST | OWNER | no |
| `/employees` | GET / POST | OWNER | no |
| `/employees/{id}` | PUT | OWNER | no |
| `/employees/{id}/toggle-active` | POST | OWNER | no |
| `/profile` | GET / PUT | any / OWNER | no |
| `/dashboard` | GET | OWNER | `?outletId=` only |
| `/dashboard/rollups` | GET | any | **yes** |
| `/dashboard/reconcile` | POST | OWNER | — |
| `/super-admin/**` | — | Super Admin | not for this client |

Notes:

- **`/payment-methods/platform` and `/payment-methods/platform/{id}`
  still exist and are now duplicates** of `/payment-methods` and
  `/payment-methods/{id}`. Nothing in either app calls them; only test
  `B4.2` does. They were left in place rather than deleted, because
  removing a deployed HTTP endpoint is not a call to make silently.
  **Do not use them** — treat them as deprecated.
- `/orders/customer-lookup` is **organization-scoped, not outlet-scoped**
  (`src/app/api/v1/orders/customer-lookup/route.ts`). It returns only
  `{ "name": string | null }` for a phone number. Deliberate: a customer
  belongs to the organization, not to one branch.
- Invoice generation refuses until the order is **paid in full and
  Delivered** (`B5.1`/`B6.5`). Don't offer the action before then.
- **Order DTO `invoice` sub-object** on `GET /api/v1/orders/{code}` (`src/app/api/v1/orders/[orderCode]/route.ts`):
  - When no invoice exists: `{ "exists": false, "canGenerate": boolean }` (`invoiceSeq`, `accessToken`, `generatedAt` omitted).
  - When an invoice exists: `{ "exists": true, "invoiceSeq": number, "accessToken": string, "generatedAt": string, "canGenerate": true }`.
  - `generatedAt`: ISO 8601 string (e.g. `"2026-09-28T00:51:34.000Z"`) from the persistent `OrderInvoice.generatedAt` column.
    Mobile clients can format this timestamp (e.g. `generatedAt.slice(0, 10)` formatted with `dateLabelFull`) to render local invoice PDFs
    with the exact same "Generated {date}" footer text as web-rendered PDFs (`src/features/admin/pdf/OrderInvoicePdf.tsx:86`),
    instead of falling back to the mobile device's local clock.
- Order creation takes a client `idempotencyKey`; the same key returns
  the same order and creates exactly one row (`B6.3`). Generate it once
  per cart and reuse it across retries.
- `POST /expenses` and `POST /employees` accept an optional
  `idempotencyKey` (1–64 chars, trimmed, stored on `Expense` and
  `StoreMembership`, `src/server/services/expenses.ts:92`,
  `src/server/services/employees.ts:55`): repeating the same key in the
  same store returns the existing DTO (`201`) without creating a second
  expense or failing on a taken phone number. The key is unique within its
  store; the same key in another store creates an independent row.
- `PUT /expenses/{id}` takes title, category, integer amount in paise,
  due (`YYYY-MM-DD`), and optional body `outletId`. Omitting it or sending
  null makes the expense organization-wide; `X-Outlet-Id` does not override
  it. A recurring occurrence cannot move to another month (400:
  "Keep a monthly bill in its original month."). `DELETE /expenses/{id}`
  returns an empty 204; deleting a recurring occurrence stops its series.
  Both routes are OWNER-only.
- `POST /expenses/{id}/pay` accepts no body, `{}`, or an optional
  `{ "paidDate": "YYYY-MM-DD" }`. Omission uses today in IST; future
  dates are rejected. A paid expense retains its original date on retry.
- To set an employee active/inactive idempotently, use `PUT /employees/{id}` with an explicit `active` (the mobile app will stop using the toggle endpoint).
- **Employee outlet assignments** (`POST /employees`, `PUT /employees/{id}`):
  the optional `outlets` (array of outlet ids) and `defaultOutletId` set which
  outlets the employee may work in. Rules (`assertAssignableOutlets`,
  `src/server/services/employees.ts`):
  - every id must be an **ACTIVE outlet of the caller's organization**;
    otherwise `400 "Invalid or inactive outlet for this organization."` and
    nothing is written (an owner cannot grant another organization's outlet);
  - `defaultOutletId` must be one of `outlets`, otherwise `400`;
  - repeated ids are stored once;
  - on `PUT`, **omitting `outlets` leaves the employee's assignments exactly
    as they are** (a name or phone edit never touches them); sending it
    replaces them for this organization. Mobile therefore sends `outlets`
    only when the owner changed them.
  - The DTO returns `outlets: [{ id, name }]` and `defaultOutletId`; an empty
    `outlets` means the employee can sign in but has nowhere to work.
- `POST /products` is an upsert by the client-chosen `id`.
- Payment recording locks the order row before checking the balance, so
  concurrent collection cannot overpay (`B6.4`). A rejected overpayment
  is a 400, not a crash.

---

## 6. What the client must do about all this

Ordered, and the first three are what unbreaks employee sign-in.

1. Parse `organizations[]` at login **and** on `/auth/status`; cache
   `allowedOutlets` + `defaultOutletId` per store.
2. Send `X-Outlet-Id` on `/orders`, `/orders/sync`, `/orders/bulk-sync`,
   `/dashboard/rollups`; put `?outletId=` on `/dashboard`. Send nothing
   when an owner is viewing all outlets.
3. Block an employee with zero allowed outlets with an explanatory
   screen — every order call will 403 for them.
4. Scope cached orders, the sync cursor and cached dashboard metrics by
   outlet as well as store, or switching outlets shows stale rows.
5. Stamp each queued offline order with the outlet it was taken at, and
   flush one request per outlet.
6. Drive checkout from `GET /api/v1/payment-methods`; submit the `name`
   verbatim; handle the empty list; keep "Pay on delivery" as a
   *no-payment* choice that sends no `initialPayment`, never as a method
   name.
7. Remove the Add / Rename payment-method screens; keep only the
   enable/disable toggle driven by `PATCH`.
8. Never pre-select a payment method (§4.4).
9. Treat a 403 on an outlet-scoped call as "outlet access changed" —
   clear the selection and re-prompt or re-authenticate. Never render it
   as an empty list.

The full client-side plan, including widgets and verification steps, is
in `../laundry_pos_mobile/docs/OUTLET-PARITY-SPEC.md`.

---

## 7. Input limits added for hardening

- `GET /dashboard?from&to`: both must be real `YYYY-MM-DD` dates, `to >= from`,
  span at most 366 days — otherwise 400.
- `POST /dashboard/reconcile`: span at most 92 days — otherwise 400.
- `POST /expenses`: `X-Outlet-Id` and `body.outletId` must match when both are
  sent — otherwise 400 `"Conflicting outlet: X-Outlet-Id and body.outletId must match."`
- Employee `password` (create/update) is at most 128 characters.

## Subscription invoices (owner billing history)

Read-only, OWNER only, available while the store is locked or lapsed
(`allowRestricted` + `allowLockedReadOnly`) so an owner can always fetch receipts.

- `GET /api/v1/subscription/invoices` → `{ invoices: [{ invoiceSeq, number,
  type: 'DEPOSIT' | 'RENEWAL', amount (paise), method | null, paidAt (yyyy-MM-dd),
  coversFrom | null, coversTo | null }] }`, newest first. No internal fields
  (recorder, free-text reference).
- `GET /api/v1/subscription/invoices/{invoiceSeq}/pdf[?download=1]` → the same
  PDF Super Admin renders. Another store's invoice, or an unknown number, is a
  plain 404. Employees get 403.

## Account deletion (added 2026-10-04)

Source: `src/server/services/account-deletion.ts`; routes under
`src/app/api/v1/account/deletion/`; wipe job `src/app/api/cron/account-deletion`.
Errors are the usual `{ "error": "..." }`.

### Request

`POST /api/v1/account/deletion` — body `{ "storeId": "<id>" }`, auth required.

- Caller is an **OWNER** of `storeId` → scope `ORGANIZATION` (the whole
  organization and its data). Anyone else → scope `SELF` (that login only).
- A `SELF` request from a user who owns *any* organization is **409**
  (`"Delete your store first."`). A caller with no active membership in
  `storeId` gets 403.
- Creates one `PENDING` request with `scheduledFor = now + DELETION_GRACE_DAYS`
  (default 90). Idempotent per (user, organization): a repeat returns the
  existing request.
- Every session of the caller is revoked immediately (the token that made the
  call stops working; they can sign in again). `ORGANIZATION` also locks the
  organization for every member (`blockedReason: "deletion_pending"`).
- `200 { "status": "PENDING", "scope": "ORGANIZATION"|"SELF", "requestedAt": ISO, "scheduledFor": ISO }`

### Restore

`POST /api/v1/account/deletion/restore` — no body, auth required.
`200 { "status": "RESTORED" }`; the organization is unlocked. **409** when
nothing is pending for the caller.

### While a request is pending

- `POST /auth/login` still succeeds. `user.deletionScheduledFor` (ISO) is
  included on login and on `GET /auth/status` only while the caller has a
  `PENDING` request; otherwise the field is absent.
- Every other `/api/v1` endpoint returns **403** `{ "error": "Forbidden",
  "reason": "deletion_pending" }`. Only `/auth/*` and `/account/deletion/*`
  work. Employees of an organization with a pending `ORGANIZATION` request have
  no request of their own: they see the same 403 and
  `blockedReason: "deletion_pending"` on their `stores[]`/`organizations[]`
  entry, and cannot restore (the owner or support must).
- After the permanent wipe, login behaves exactly like an unknown phone number
  (`401 "Invalid phone number or password"`). Nothing reveals the account existed.

### Wipe (daily cron, `CRON_SECRET`)

Pending requests with `scheduledFor <= now` are wiped one transaction each.
`ORGANIZATION`: the organization and all its orders, payments, invoices,
services, expenses, outlets, memberships and settings, plus every user left with
no other membership. `SELF`: that user only; their orders stay with the
organization (status-event actor becomes null, shown as former staff). Review
demo organizations (`isReviewDemo`) are never wiped; their pending requests are
auto-restored after 24 hours.

Retained after a wipe: the `AccountDeletionRequest` row (opaque `userId`,
`organizationId`, role, scope, status, dates, channel — no phone, name, email or
organization name) and, for an `ORGANIZATION` wipe, `BillingRecordArchive` rows
(opaque organization id, invoice number, type, amount, method, paid date and
covered period — no reference, notes, recorder or names).
