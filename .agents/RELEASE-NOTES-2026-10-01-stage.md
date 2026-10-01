# Backend release notes — stage, 2026-10-01 (pairs with KlenPOS mobile 1.0.4+6)

Deploy this **before** the mobile stage build. No database migrations. No new env vars; production must have `SESSION_SECRET` set.

## Behaviour changes
- `GET /api/v1/employees` is uncached: a list fetched right after create/edit/toggle is current.
- `POST /employees` and `PUT /employees/{id}`: `outlets` must be the organization's own ACTIVE outlets and `defaultOutletId` must be one of them, else 400 "Invalid or inactive outlet for this organization." / "The default outlet must be one of the selected outlets."
- Invoice PDFs (`/orders/{code}/invoice/pdf` and the admin route): an employee gets 403 for orders of an outlet they are not assigned to.
- Orders: idempotency key lookup is outlet-checked; status updates lock the row.
- Auth: `must_change_password` enforced on API calls; production refuses to run without `SESSION_SECRET`; stricter password/session/token handling and public-error whitelist.
- `GET /dashboard/rollups`: reconcile span capped at 92 days; invalid calendar ranges rejected.
- `GET /dashboard`: month-to-date `from`/`to` with `granularity=day` is the mobile default; `cash` has 1–5 buckets depending on days elapsed in the month.
- `MOBILE_BLOCK_TERMS_NOT_SET` unchanged (`false`).

## Verification
`npx tsc --noEmit` clean; `LC_ALL=C LANG=C node scripts/test-subscription-payments.mjs` → 118 passed, 0 failed (disposable local Postgres).

## Smoke after deploy (stage)
1. Owner login; `GET /employees` shows current staff.
2. Create an employee with outlets; the next `GET /employees` includes them with the outlets.
3. As an employee of outlet A, request an invoice PDF of an outlet-B order → 403.
4. `GET /dashboard?from=<1st of month>&to=<today>&granularity=day` → 200.
