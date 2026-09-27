# Workspace notices, Super Admin profile and responsive QA

Verified locally on 27 September 2026. No deployment or shared business/account-data changes.

## Implementation

- Removed the old page-level TrialBanner; the shared top strip is the only trial notice.
- WorkspaceNotice supplies one reusable, accessible top-strip presentation with info/warning tones, optional action and optional dismissal. Trial status stays visible and links owners to Profile.
- WorkspaceAnnouncements consumes src/lib/workspaceAnnouncements.ts in both workspace shells. This is deployment-managed configuration, currently empty, not a publishing/admin screen. Notices can target store, platform or all workspaces. A close action persists across client navigation while the shell remains mounted; full reload remounts it.
- Added /super-admin/profile, Profile sidebar/avatar links and a separate explicit Log out control. Name, phone and email are editable. Password change checks the current password using the existing shared service.
- Both actions derive the account ID from requireSuperAdmin. Phone changes increment credentialVersion and revoke all sessions; password changes use the same existing revocation flow. Profile writes leave memberships and privilege flags untouched. Duplicate phone and malformed inputs return usable errors.

## Verification

- TypeScript and targeted ESLint pass.
- All 86 integration tests pass in disposable local PostgreSQL. Four new cases cover details validation/credential preservation, owner exclusion/duplicate phones, login-phone revocation and password verification/revocation.
- Isolated webpack production build passes, including the new profile route. The active dev server output was left alone.
- Authenticated owner main pages checked: Dashboard, Products, Sales, Expenses, Employees, Outlets and Profile. No document horizontal overflow at 1389px or 375px. The initially unhydrated Products/Expenses banner observations were followed by a visible shared-banner check; mobile checks wait for session verification on every page.
- Authenticated Super Admin main pages checked: Dashboard, Organizations, People, Subscriptions, Billing, Payment methods, Activity and Profile. No document horizontal overflow at 1389px or 375px. Organization detail, profile editor and Add outlet dialog visually checked on mobile. Billing table verified to scroll inside its tablecard at 412px, with the document remaining 412px wide.
- Owner mobile navigation and New sale dialog visually checked at 375px; dashboard outlet/header alignment checked at 412px.
- Temporary maintenance announcement was shown, dismissed and checked across client navigation; trial strip remained visible. The temporary configuration was removed.
- Owner attempt to open /super-admin/profile returned to the owner dashboard; existing sign-in/sign-out worked for both accounts. Final browser session restored to Store Owner on Expenses, viewport override reset.
- No live profile edits, password changes, orders, payments or outlet mutations were submitted. New write behavior is exercised against disposable test fixtures. The supplied owner has empty operational lists, so populated owner-list checks are outside this account's evidence.

## Evidence

- qa-evidence/owner-expenses-desktop-notices.png
- qa-evidence/owner-profile-mobile-notices.png
- qa-evidence/owner-new-sale-mobile.png
- qa-evidence/super-admin-profile-desktop.png
- qa-evidence/super-admin-profile-edit-mobile.png
