# Project memory (committed, travels to cloud sessions)

Durable preferences and facts only. Session state lives in
`.agents/SESSION-HANDOFF-2026-09-27.md`; the mobile API lives in
`.agents/MOBILE-API-CONTRACT.md`. Native `~/.claude` memory and `.wiki/` are
machine-local and do **not** reach cloud sessions — this file does.

## How the user wants to work

- Never commit without explicit permission, per batch of work.
- Preserve the current user-authorized working branch. Earlier offline-id work
  used separate backend/frontend branches; inspect Git before choosing a branch.
  Do not merge or push merely because a batch has been committed.
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

## Workspace improvements (2026-09-27)

- Login identifiers are normalized personal phone numbers (8–15 digits), across web, mobile API, onboarding and staff/platform users. Phone changes revoke sessions through credentialVersion; deploy seed gating uses SEED_OWNER_PHONE.
- Invoice generation/layout, crisp browser preview and print/share helpers are shared. Owner order details expose one outline Invoice button; public invoice views use opaque access tokens and offer Print/Download. Keep tenant authorization in services/routes.
- Workspace notices show trial/subscription/lock status once at the top. Locked organizations retain authorized read-only access; server mutation guards remain mandatory alongside disabled UI controls.
- Super Admin announcements persist drafts/published notices with audience/organization targeting and optional safe links. All matching published notices stack independently; dismissal is session-scoped by user, organization, announcement and revision. Organization selection is bounded and searchable.
- Super Admin profile supports editing own details and changing own password. Owner UI uses shared spacing, full-dialog mutation overlays and a full-width footer divider.
- POS/client caches must remain user/organization/outlet scoped; server cache invalidation covers catalogue, profile, organization and subscription changes. Preserve offline draft recovery and credential revocation.
- See SESSION-HANDOFF-2026-09-27.md and CURRENT-STATE.md for point-in-time verification and limitations. Verify current Git state before selecting a branch; old backend/offline-id notes describe earlier work.
