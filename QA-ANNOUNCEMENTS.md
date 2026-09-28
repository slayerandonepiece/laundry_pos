# Super Admin announcements

## Implemented

- `/super-admin/announcements`: create drafts, edit, publish and unpublish information or maintenance/warning messages. Store, platform or everyone audiences; optional organization selection and safe local/HTTPS link.
- Authenticated Super Admin actions derive the actor from the session. Service validation rejects owner writes, unknown organizations, empty messages, incomplete links and unsafe URLs. Updates use revision checks; announcement and audit writes commit together.
- Dedicated `workspace_announcements` table. Existing store/account/subscription records are unchanged. Only the additive announcement migration is pending in the configured Neon database.
- Both workspace shells display published messages. Server derives user/store audience; clients receive no other organization targeting IDs. Refresh on navigation, focus and every 60 seconds, plus immediate local admin save refresh. Stale requests and store-context changes are guarded.
- Announcement dismissals persist in sessionStorage per account, organization, announcement and revision, including page reloads. Editing/republishing makes a new revision visible. Subscription/trial notices stay non-dismissible.

## Verification

- 89 integration tests passed in a disposable PostgreSQL cluster, including 3 new announcement authorization, persistence, targeting and validation tests.
- Prisma schema validation, TypeScript, targeted ESLint and scoped diff checks passed.
- Isolated webpack production build passed without touching the active development `.next` folder.
- Live account/browser tests pending approval to apply the additive migration. No live announcement has been published yet.

## Live acceptance gates

- Super Admin: draft hidden; target stores; publish; edit after dismissal; unpublish removes banner; invalid link rejection.
- Subscription store and trial store: audience targeting, information/warning styles, action link, dismissal across navigation/reload, revision reappearance, removal after unpublish.
- Confirm trial strip and announcement coexist; desktop and mobile controls remain usable.
- No subscription dates, lock states, passwords, orders or payments are modified for testing.


## Locked store follow-up — 27 September

- Explicit server-rendered read-only access opt-in preserves active membership and organization checks. Default session guards and `assertStoreWritable` still reject locked writes; archived and inactive membership access stays blocked.
- One shared lock banner; owner records remain visible. Creation, editing, deletion, payment recording, status changes, invoice generation, password changes, and payment-method toggles are disabled. Filters, details, navigation and logout remain available.
- Verified the already-locked Express Laundry account on Expenses, Sales and Profile. Mobile Profile at 375px has no horizontal overflow and disabled editing/password/payment controls.
- 89 disposable PostgreSQL integration tests passed, including locked read opt-in, default/write denial, wrong role, unrelated user, inactive membership, and archived access checks. TypeScript, targeted lint and isolated production build passed.
- Missing announcement table now produces a setup-pending page rather than the generic unexpected-error boundary. Live publication/dismissal testing remains pending explicit approval for the shared Neon announcement migration.


## Database migration applied — 27 September

User authorized migration of pending database changes. `prisma migrate deploy` applied `20260927180000_workspace_announcements` successfully to the configured Neon database. A subsequent `prisma migrate status` confirmed the database is up to date (all 16 migrations applied). This migration creates only the announcement table and its index. Live publication and dismissal checks remain to be completed; migration success alone does not verify those flows.


## Announcement UI redesign — 27 September

List-first interface with All/Published/Drafts filters and counts, message search, status and audience metadata, and Edit/Publish/Unpublish controls. Creation/editing uses the existing shared Super Admin dialog, separate draft/publish actions, live banner preview, and unsaved-change confirmation. Organization checkboxes use scoped horizontal labels to avoid global form styles stacking them vertically.

Verified authenticated desktop empty list, create dialog, targeting checkbox, warning preview, discard confirmation and status filter. At 375px, page width is 375px and dialog width is 351px (no horizontal overflow). Test input was discarded; no live announcements were created or published during this visual check. TypeScript, targeted ESLint and scoped diff check passed. Populated list persistence is covered by existing service integration tests; a live populated-list visual check was not performed.


## Scalable announcement composer — 27 September

Equal desktop columns separate message/appearance/preview from audience targeting. Explicit All organizations versus Selected organizations scope, organization search, selected count, clear selection, and a fixed-height multi-select list replace the expanding checkbox section. The list is 240px on desktop and 200px on mobile, with internal scrolling; targeted selection follows the existing service limit of 100 organizations. Selecting a specific scope with no organizations is rejected before saving.

Authenticated browser verification: selected Express Laundry, searched R K, selected R K Laundry, cleared the search, and confirmed both selections were retained. Empty search results displayed correctly. At 1151px, the columns measured 446px each and the list measured 240px. At 375px, the composer stacked to one 307px column, the list measured 200px, and page width remained 375px. Test selections were discarded without saving or publishing. TypeScript and targeted ESLint passed.


## Header/footer follow-up — 27 September

Confirmed announcement delivery currently stacks all matching published announcements, oldest-created first (ID tie-break), with independent per-session revision-based dismissal. Trial/lock status is separate. No announcement selection policy was changed.

Moved Super Admin Add payment method into PageHeading action, removing its separate row. Authenticated browser verified exactly one button in `.phead-r`, and opening/cancelling the unchanged add dialog. Mobile 375px page width remained 375px.

Moved the shared owner workspace footer outside the padded main area. Divider spans the entire workspace, horizontal padding is zero and bottom padding is at least 16px (safe-area aware). Browser verified footer/workspace width both 1145px on desktop, and footer/page width 375px on mobile. No live payment methods or announcements were changed. TypeScript, targeted lint and scoped diff check passed.
