# Platform Users — implementation plan (StoreOps, F series)

Status: **implemented and verified** — see `.agents/CURRENT-STATE.md`'s
"Platform Users" section for what actually shipped and how it was checked.
The checklist below is the original pre-implementation plan, kept for
historical reference; individual items were not ticked off as they landed,
so do not read an unchecked box as "not done." Treat `CURRENT-STATE.md` as
authoritative over this file for current status. Scope: a Super
Admin-facing, cross-store user directory (`/super-admin/users`), separate
from the existing per-store employee management at `/admin/employees`
(`src/features/admin/...`, `src/server/services/employees.ts`), which stays
as-is for owners managing their own store's staff. Mirrors the design
canvas's F1–F7 screens. Dashboard is out of scope.

Do not confuse this with `src/server/services/employees.ts` — that service is
store-scoped (an owner managing their own employees) and should not be
touched. This plan is the platform-wide view across every `User` row and
every `StoreMembership`, for the Super Admin.

## 1. Schema

No changes needed. `User` (with `isSuperAdmin`), `StoreMembership`
(`userId` + `storeId` + `role`, unique per pair) already model everything the
F-series screens need: a user with zero, one, or multiple memberships; a
store's membership list.

## 2. Backend

New file `src/server/services/platform-users.ts` (parallel to `stores.ts`):

- [ ] `listUsers()` — every non-super-admin `User`, with their memberships
      (store name + role) for the "Stores" / "Other stores" columns in F1.1's
      table. Handle the zero-store case (F2's note: "user can be created with
      empty store, assigned later") — a user with no memberships must still
      list correctly, not error.
- [ ] `getUser(userId)` — for F4 (User Detail): profile fields, membership
      list, session/last-sign-in info if that's tracked (currently `Session`
      has `createdAt`/`expiresAt` but no explicit "last used" timestamp — add
      one if the detail screen needs it, or derive "last sign-in" from the
      most recent `Session.createdAt` for that user as an approximation).
- [ ] `createUser(input, superAdminId)` — F2. Fields: name, username,
      password, optional single `storeId` + `role` (the design replaced the
      old multi-store checkbox picker with one optional dropdown). If a store
      is picked, create the `StoreMembership` in the same transaction.
- [ ] `updateUser(userId, input, superAdminId)` — F3. Profile fields, and the
      one optional store/role dropdown — changing it means removing any
      existing membership and creating the new one (a user in this admin's
      model has at most one store from this screen; if a user needs a second
      store, that happens via the store's own onboarding/assignment flow, not
      here — confirm this assumption, see Open decisions).
- [ ] `resetUserPassword(userId, input, superAdminId)` — F5. `input` is
      either `{ mode: 'auto' }` (generate and return a one-time password) or
      `{ mode: 'manual', password: string }`. Either way: hash it, bump
      `credentialVersion`, and call `revokeAllSessionsForUser` (already exists
      in `src/server/auth/session.ts`) so any live session is killed
      immediately — same guarantee the existing owner/employee password-change
      path already gives, reuse it rather than reimplementing.
- [ ] `deactivateUser(userId, superAdminId)` — F7. Sets `active = false` and
      revokes sessions (same helper as above). Reactivation: confirm whether
      F7's screen is toggle (deactivate/reactivate) or one-way — the design
      only showed deactivate.
- [ ] zod schemas for all inputs, following the `stores.ts` pattern
      (`usernameSchema` can be imported/reused as-is rather than duplicated).

## 3. Server Actions

New `src/features/super-admin/actions/users.actions.ts`, each
`requireSuperAdmin()`-gated, `revalidatePath('/super-admin/users')`:

- [ ] `createUserAction`
- [ ] `updateUserAction`
- [ ] `resetUserPasswordAction`
- [ ] `deactivateUserAction`

## 4. Frontend

New route `src/app/super-admin/users/page.tsx` (+ `[userId]` for detail), new
components under `src/features/super-admin/components/`:

- [ ] `UsersEmptyState` — F1, true empty state (no users at all — realistically
      only hit if this ships before any store is onboarded, since onboarding
      always creates an owner).
- [ ] `UsersList` — F1.1, populated table with search/filter, matching the
      full-width table treatment already applied elsewhere in this canvas.
- [ ] `UserAddDialog` — F2, single optional store `<select>` instead of a
      multi-store checklist.
- [ ] `UserEditPage` or dialog — F3, one continuous page/dialog with
      Profile / Store access / Security as visually separated sections, not
      tabs (per the design's explicit "remove the tab bar, it's not required"
      feedback).
- [ ] `UserDetail` — F4, one page, no tab bar (same reasoning as F3).
- [ ] `ResetPasswordDialog` — F5, a segmented control for "Generate
      automatically" vs "Set manually", plus F6's confirmation/done state
      (show the generated password once, matching the onboarding wizard's
      existing temporary-password pattern in `OnboardingWizard.tsx`).
- [ ] `DeactivateUserDialog` — F7.
- [ ] Cross-link from Store Detail's Users tab (see `STORES-IMPLEMENTATION.md`,
      E2) to this area's User Detail, and vice versa — the design removed
      Store Detail's own "who can do what" table and reset-password button in
      favor of linking here, so this area needs to exist first (or land in
      the same effort) for those Store Detail changes to have somewhere to
      link to.

## Open decisions (confirm before building)

- **Multi-store users**: can a `User` have more than one `StoreMembership`
  today (schema allows it), and if so, does F2/F3's single-dropdown UI need a
  secondary "add another store" affordance, or is a second store always
  assigned from that *other* store's own onboarding/assignment screen instead?
  The design assumed the latter — confirm before locking the single-dropdown
  UI in as final.
- **Reactivation**: F7 only designed deactivate. Decide whether reactivating a
  deactivated user is in scope for this pass or a later one.
