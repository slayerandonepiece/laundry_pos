# Stores — implementation plan (StoreOps, S series)

Status: **implemented and verified** — see `.agents/CURRENT-STATE.md`'s
"Store Detail, edit, lock/unlock enforcement, delete" section for what
actually shipped and how it was checked. The checklist below is the original
pre-implementation plan, kept for historical reference; individual items were
not ticked off as they landed, so do not read an unchecked box as "not done."
Treat `CURRENT-STATE.md` as authoritative over this file for current status.
Scope: the `/super-admin/stores` area beyond the existing directory +
onboarding wizard — empty state, edit (dialog + full page), lock/unlock,
delete, and store-status enforcement. Mirrors the design canvas's S1–S5
screens. Dashboard is out of scope (see `.agents/CURRENT-STATE.md`).

Already done: `StoresDirectory.tsx` (populated list) and the 4-step
`OnboardingWizard.tsx`. Everything else below is new.

## 1. Schema

- [ ] No new columns needed for edit/lock/delete — `Store.status` (`ACTIVE` |
      `LOCKED`) already exists (`prisma/schema.prisma`). Confirm no migration
      required before starting; this section stays empty unless the edit
      screen ends up wanting fields the schema doesn't have (e.g. a second
      contact, GSTIN — not currently modeled).

## 2. Backend

`src/server/services/stores.ts` currently exports `listStores`,
`getDashboardStats`, `lookupOwnerByUsername`, `onboardStore`. Add:

- [ ] `updateStore(storeId, input, superAdminId)` — validates and updates
      `name`, `address`, `phone`, `email` (email has a column but no writer
      today). Used by both S2 (quick dialog) and S3 (full page) — same
      service call, two entry points.
- [ ] `setStoreStatus(storeId, status: 'ACTIVE' | 'LOCKED', superAdminId)` —
      the S4 lock action. Record who/when (see audit note below).
- [ ] `deleteStore(storeId, superAdminId)` — the S5 flow. Decide and
      implement the actual policy (see "Open decisions" — this is destructive
      and cascades through `Subscription`, `SubscriptionPayment`, `Product`,
      `Order`, `Expense`, `RecurringExpenseSeries` per the schema's
      `onDelete: Cascade`). At minimum: require a typed confirmation value
      from the client (matches the S5 design's "type the store name" pattern)
      and re-verify it server-side, not just in the UI.
- [ ] Extend `requireStoreSession()` (`src/server/auth/session.ts`) to check
      `store.status === 'LOCKED'` and throw `AuthError('FORBIDDEN')` — **this
      is currently not enforced at all**. Today `Store.status` is stored and
      surfaced in `listStores()`'s `paymentState`, but nothing reads it at
      auth time, so a locked store's staff can still sign in and use every
      screen. This is the actual backend behind the A4 "store locked" screen
      already in the design canvas — build the enforcement, not just the
      splash page.
- [ ] Audit trail for lock/unlock and edit actions — there's no
      `StoreActivity`/audit table yet (the E4 "Store detail → Activity" design
      screen has nothing to read from). Either add a lightweight
      `StoreAuditEvent` model (storeId, actorId, action, at, meta) or decide
      this is out of scope for v1 and the Activity tab ships as a stub. Flag
      this decision explicitly before building E4/S-series activity UI.
- [ ] zod schemas for all of the above, following the existing pattern in
      `stores.ts` (`onboardSchema`, `usernameSchema`).

## 3. Server Actions

`src/features/super-admin/actions/stores.actions.ts` currently only wraps
`onboardStore`. Add, each `requireSuperAdmin()`-gated and calling
`revalidatePath('/super-admin/stores')`:

- [ ] `updateStoreAction`
- [ ] `lockStoreAction` / `unlockStoreAction` (or one `setStoreStatusAction`)
- [ ] `deleteStoreAction`

Return shape should match the existing pattern: `{ ok: false, error }` for
validation failures via `ValidationError`, never a thrown error crossing the
boundary as a raw message.

## 4. Frontend

New components under `src/features/super-admin/components/`, new route(s)
under `src/app/super-admin/stores/`:

- [ ] `StoresEmptyState` — S1. Shown when `listStores()` returns `[]`;
      `StoresDirectory` needs a branch for this instead of rendering an empty
      table.
- [ ] Row menu on `StoresDirectory` (S1.1 currently has no actions per the
      design) — Edit / Lock / Delete entries.
- [ ] `StoreEditDialog` — S2, quick edit from the row menu (name/address/
      phone/email only, per the design).
- [ ] `/super-admin/stores/[storeId]/edit` route + `StoreEditFull` component —
      S3, reached from Store Detail. Folds in the Danger Zone (lock/delete)
      per the design rather than duplicating those as separate top-level
      routes.
- [ ] `LockStoreDialog` — S4, confirmation + reason/notes field if the
      backend ends up tracking that.
- [ ] `DeleteStoreDialog` — S5, typed-confirmation pattern (type the store
      name to enable the destructive button), matching the design canvas.
- [ ] Store Detail page/tabs (Overview / Users / Subscription / Activity —
      E1–E4 in the design) do not exist in the app at all yet. `StoresList`
      currently has no click-through to a detail view. This is a prerequisite
      for S3 (edit links out from here) and for the Users-area work in
      `USERS-IMPLEMENTATION.md` (Store detail → Users tab). Build the
      route/shell (`/super-admin/stores/[storeId]`) before or alongside S3.

## Open decisions (confirm before building)

- **Delete policy**: hard delete (cascades per schema) vs. soft
  archive/deactivate. The design's S5 screen implies hard delete with a typed
  confirmation, but that permanently destroys order/payment history for the
  store. Recommend soft-delete (a new `ARCHIVED` status, or a `deletedAt`
  column) unless there's a compliance/storage reason to actually purge — flag
  this back to the user rather than assuming.
- **Store Detail's four tabs**: build as four routed tabs (`/stores/[id]`,
  `/stores/[id]/users`, etc.) or one page with client-side tab state (matching
  the collapsed treatment already applied to User Edit/Detail in the Users
  work)? The design canvas kept Store Detail as four separate screens — this
  plan assumes that stays the default unless told otherwise.
