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

## Project and agent documentation

- [Shared agent guidance](.agents/README.md)
- [Implemented frontend and architecture](.agents/CURRENT-STATE.md)
- [Backend implementation plan within Next.js](.agents/BACKEND-PLAN.md)

Codex/GPT uses `AGENTS.md`; Claude and Gemini have `CLAUDE.md` and `GEMINI.md`
entry files referencing the same guidance. Tools that do not load repository
instructions automatically should be directed to `AGENTS.md` explicitly.

Components render UI; containers own state and behavior. For code changes run
`npm run lint` and `npx tsc --noEmit`; see the agent guidance for behavioral checks. 
