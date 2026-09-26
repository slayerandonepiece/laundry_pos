# Project memory (committed, travels to cloud sessions)

Durable preferences and facts only. Session state lives in
`.agents/SESSION-HANDOFF-2026-09-26.md`; the mobile API lives in
`.agents/MOBILE-API-CONTRACT.md`. Native `~/.claude` memory and `.wiki/` are
machine-local and do **not** reach cloud sessions — this file does.

## How the user wants to work

- Never commit without explicit permission, per batch of work.
- Keep **one working branch per repo, named per side**: `backend/offline-id`
  here, `frontend/offline-id` in `laundry_pos_mobile`. Pull `main` into it
  before each batch; merge finished work to `main`.
- Backend and frontend work happen in **separate chats**, each with its own
  prompt and its own diff — never club the two repos in one session or diff.
- Merging does not deploy (auto-deploy disabled by the user) — but `vercel-build` runs `prisma migrate deploy` whenever a
  deploy does run.
- Staging DB (Neon) is additive-only unless the user asks for a reset.
- Confirm before irreversible actions; payments cannot be reversed.
- Surgical changes only (`CLAUDE.md`). Keep `.agents/*` docs current when
  routes, persistence or permissions change.
- UI says "Organization" for the `Store` model. In the user's words "store"
  usually means **outlet**.
- End every session by updating this file and the session handoff, and
  mention artifacts and discussions.

## Durable technical facts

- Orders carry two ids: `id` = `EL-<orderNumber>` (server), `offlineId` =
  mobile-generated UUID, unique per organization (`@@unique([storeId,
  offlineId])`), null for web orders. Create is idempotent by
  `idempotencyKey` and by `offlineId`; bulk-sync `orderRef` accepts either.
  An `offlineId` may not look like `EL-<n>`; refs are trimmed.
  Bulk-sync applies the employee outlet check per action. Contract §3.5.
- Order DTO returns payment `clientActionId`, so the app matches offline
  payments exactly.
- Expense and staff create are idempotent by `idempotencyKey` (unique on
  `Expense` / `StoreMembership`), same pattern as orders: lookup first,
  cross-organization key → 400, `P2002` race → return the winner.
  `POST /employees/{id}/toggle-active` flips and is not retry-safe; the app
  uses `PUT /employees/{id}` with an explicit `active`.
- Validation: `npx tsc --noEmit`, `npm run lint`, `npm run build`; flow tests
  `LC_ALL=C LANG=C npm run test:subscription-payments` (needs Postgres;
  local `initdb`/`pg_ctl`/`psql` from Homebrew work on the user's Mac).
  Offline-id flow tests are `B3.7`–`B3.10` in
  `tests/outlet-operational.integration.test.ts`.
- The Prisma client (`src/generated/prisma`) is not committed: run
  `npx prisma generate` after pulling a schema change, or the local client
  lacks the new fields.
- Cloud sessions: `npm ci` fails (lockfile out of sync with
  `@emnapi/*`); use `npm install` and then `git checkout package-lock.json`.
  `tsconfig.tsbuildinfo` is tracked and dirties on every `tsc` — restore it.
  Deleting remote branches is refused (HTTP 403) by the session git proxy.

## Artifacts

- Mobile owner-screen wireframes: https://claude.ai/artifact/KXDqbi19o2crwHR9rw8to3
- Mobile plan for this work: `laundry_pos_mobile/docs/OFFLINE-ID-SYNC-PLAN.md`
