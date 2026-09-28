# Express Laundry / StoreOps workspace

Multi-tenant Next.js App Router app (React, TypeScript) backed by Postgres
(Neon) via Prisma 7 — no separate backend service. The public website is
maintained separately in `../vendor_websites/express-laundry`.

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`: signed-out users go to `/login`; signed-in owners
see the dashboard. Employees land at `/admin/sales`. Old `/admin/login` and
`/admin/dashboard` URLs redirect to the canonical routes. Platform admins
(Super Admin) sign in separately at `/super-admin/login` and manage store
onboarding/subscriptions at `/super-admin/stores`.

All application data (stores, users/sessions, products, orders, expenses,
subscriptions) is stored in Postgres. `Store` is the tenant boundary — every
owner/employee belongs to a store via `StoreMembership`, and every domain
record carries a `storeId`. Login/role checks are real server-verified
sessions, not a frontend demo.

## Local database: migrate, seed, reset

`prisma7.config.ts` is picked up automatically and loads `.env` (via
`dotenv/config`), as does `prisma/seed.ts`. Migrations use `DIRECT_URL`; the
app and the seed script use `DATABASE_URL`. Both must be Neon URLs — the
runtime and seed connect through the Neon adapter, so a plain local Postgres
will not work for `npm run dev` or seeding. Point them at your **dev** branch.

Values can come from `.env` or be passed inline; an inline value wins, because
`dotenv` never overrides a variable that is already set.

```bash
# After pulling: regenerate the client and apply pending migrations (no data loss)
npm install
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy
```

Seed the Super Admin (the only thing the seed creates; re-running leaves an
existing user unchanged). Organizations, outlets and owners are then created
through the Super Admin UI.

```bash
# Way 1 — from .env (set SEED_OWNER_PHONE, SEED_OWNER_PASSWORD, optional SEED_OWNER_NAME there)
npx prisma db seed

# Way 2 — inline
SEED_OWNER_PHONE=919876543210 SEED_OWNER_PASSWORD='change-me' SEED_OWNER_NAME='Super Admin' \
  npx prisma db seed
```

Full reset — drops **all** data in the target database and re-applies every
migration. Prisma 7's reset does not run the seed, so seed afterwards. Check
`DIRECT_URL` is the dev branch first; never reset staging or production.

```bash
# Way 1 — URLs and seed values from .env
npx prisma migrate reset --force
npx prisma db seed

# Way 2 — inline (overrides .env for this command only)
DIRECT_URL='postgresql://…dev-direct…' npx prisma migrate reset --force
DATABASE_URL='postgresql://…dev-pooled…' SEED_OWNER_PHONE=919876543210 SEED_OWNER_PASSWORD='change-me' \
  npx prisma db seed
```

Other useful commands: `npx prisma studio` (browse data), `npx prisma validate`.
Integration tests don't touch `.env` or Neon — they start their own disposable
local Postgres: `LC_ALL=C LANG=C npm run test:subscription-payments` (needs
`initdb`/`pg_ctl`/`psql` on `PATH`; see `tests/README.md`).

## Project and agent documentation

- [Shared agent guidance](.agents/README.md)
