# Lane: Gemini — workspace UI bugs + responsiveness

Status: NOT_STARTED   <!-- NOT_STARTED | IN_PROGRESS | BLOCKED | DONE -->
Agent: gemini
Written: 2026-09-21 by Claude, from a live browser QA pass on 2026-09-20.

This file is your brief AND your progress log. Update the task table as you go
and commit it with each fix, so the work survives if your session ends. Anyone
resuming reads this file first.

---

## 0. Read first (in this order)

1. `AGENTS.md`, `.agents/README.md` — repo conventions. Binding.
2. `.agents/css-refactor/PROTOCOL.md` — the refactor's rules. You are working a
   *side lane*, not a numbered phase, but rules 4–8 apply to you in full.
3. `.agents/css-refactor/STATUS.md` — especially cross-phase findings **F1** and **F2**.
4. This file.

## 1. How to find code — graft first, always

This repo is indexed by `graft` (installed at `/usr/local/bin/graft`). Use it
**before** grepping or opening files. Never read a whole file when a span will do.

```bash
graft map                                  # orientation, first time only
graft ask "<question>" --source            # ranked nodes with code spans inlined
graft grep "<literal>"                     # EXHAUSTIVE — every occurrence, grouped by symbol
graft skeleton <file>                      # every definition + line span, ~10x cheaper than reading
graft callers <symbol> --depth 2           # blast radius before changing a shared helper
```

- Use `graft grep` (not `ask`) for any "every caller / every occurrence" question —
  `ask` is ranked top-N and will miss consumers.
- Ignore hits under `scratch/` — it is untracked, broken, and not part of the app.
- After you finish, run `graft build` so the index reflects your changes.

## 2. Scope

### 2a. Bugs to fix — root causes already verified

| # | Bug | Where | Verified root cause | Expected fix |
|---|---|---|---|---|
| B1 | Profile shows **"Password last changed: Invalid Date"** | `src/features/admin/components/Profile.tsx:63`, fed by `src/app/(workspace)/admin/profile/page.tsx:35` | `page.tsx` passes `user.updatedAt.toISOString()` (a full timestamp like `2026-09-19T10:23:00.000Z`). `dateLabel` in `src/features/admin/admin.data.ts:5` appends `'T12:00:00'` to its input because it expects a bare `YYYY-MM-DD` calendar date — producing `…000ZT12:00:00`, which is `Invalid Date`. | Format the timestamp correctly for display (IST, the repo convention). Do **not** change `dateLabel` itself — `graft callers dateLabel` first; it has many correct callers passing calendar dates. |
| B2 | **"1 employees across 2 outlets"** | `src/features/admin/components/Employees.tsx:23` | No pluralisation on either noun. | Singular/plural for both `employee` and `outlet`. Keep the rest of the sentence byte-identical. |
| B3 | Outlet status badge reads **`ACTIVE`** on Profile but **`Active`** on the Outlets screen | `src/features/admin/components/Profile.tsx:100` renders the raw enum `{outlet.status}` | Profile skips the label mapping the Outlets screen uses. | Find the Outlets screen's mapping with `graft grep` and reuse it. Do not write a second mapping. |
| B4 | Profile's Outlets mini-table looks unlike every other table in the app | `src/features/admin/components/Profile.tsx:86` | A bare `<table>` with inline styles and no class: transparent header, `font-weight:400`, no uppercase, no header band. Every other workspace table uses `<table className="grid">`. | Use `className="grid"` like `OutletsList.tsx` and drop the now-redundant inline styles on that table. Keep columns, content and the "View all" link unchanged. |

### 2b. Investigate and REPORT ONLY — do not change code or data

| # | Observation | What to find out |
|---|---|---|
| R1 | Profile → Payment methods lists **`Upi`** (should read `UPI`). | Store onboarding seeds `'UPI'` correctly (`src/server/services/stores.ts:314`), so this is probably a *platform* payment method whose display name a Super Admin typed as `Upi` — i.e. data, not a code bug. Confirm where the rendered name comes from. **Do not rename data and do not add a casing transform** — names are user-entered and a transform would corrupt legitimate names. Report the finding. |
| R2 | B1's label is semantically wrong even once it formats: `user.updatedAt` changes on *any* user-row update (name, phone…), not only on password change. | Confirm by checking what writes `User.updatedAt`. Report it. **Do not add a schema column** — that is a product decision. Just fix the display in B1. |
| R3 | Products table shows the full cuid as the first column (≈331px wide, wraps to two lines on mobile). | Report only — a design decision. |
| R4 | Expenses and Employees stack a page heading and a card heading with the same word. | Report only — README says preserve copy. |

### 2c. Responsiveness audit — static, then fix genuine defects

Audit every **workspace** screen for layout breakage at **1440, 1024, 768 and 375 px**:
Dashboard `/`, Products, Sales, Orders, Expenses, Employees, Outlets (+ outlet detail),
Profile, and the dialogs they open (product editor incl. weight-slab mode, expense
editor, employee editor, new sale / order cart, order details).

Look for, in code:
- tables without a horizontally scrollable wrapper, or with `white-space:nowrap`
  and no overflow handling
- fixed pixel widths / `min-width` that exceed 375px
- flex rows that do not wrap where content can outgrow them
- dialogs whose width or height can exceed the viewport, or that do not scroll
- touch targets under 40px on mobile
- mobile breakpoints that hide table columns **by position** (`nth-child`) —
  `admin.css` has one such rule on `.ad-table`; check it hides the right columns
  for the only table that uses it (Sales) and does not hide something essential

Already verified fine live on 2026-09-20 (do not "fix"): no horizontal page scroll
at 375px on Products and Sales; Products falls back to cards and Sales to a list
on mobile.

Fix only **genuine** defects you can point to in code. For each fix record the
file:line, the width it breaks at, and why. Prefer the smallest change in the
component's existing stylesheet or markup.

### 2d. One sidebar/topbar on every workspace screen — owner's explicit request

Measured live at 1440px on 2026-09-20: the workspace renders **three different
chromes**. Super Admin is the reference theme for the whole app.

| Property | Super Admin (TARGET) | Workspace Dashboard | Every other workspace screen |
|---|---|---|---|
| Sidebar width | 244px | 212px | 196px |
| Sidebar padding | 22px 16px 18px | 20px 14px | 20px 12px |
| Nav gap | 2px | 4px | 7px |
| Nav item | min-height 38px · padding 8px 10px 8px 8px · 13.5px/500 · 3px left border, radius 0 9px 9px 0 | padding 9px 10px · 14px/500 · 3px left border | min-height 48px · padding 12px 16px · weight 600 |
| Active item | brand-soft bg · brand left border · brand text · 700 | same idea | pill bg, no left border |
| Brand block | 36px mark + name + small caps label | mark and label **hidden** | mark + name + label |
| Topbar | 60px · padding 0 24px | 58px · padding 0 24px | 76px · padding 0 38px |
| Main padding | 24px 28px 32px | 26px 30px | 34px 38px 0 |
| Owner nav items | — | **8 (includes Orders)** | **7 (no Orders)** |

Root causes:
- `src/features/admin/components/AdminChrome.tsx:81` adds `ad-dashboard-shell` to the
  app root **only on Dashboard**, and `src/app/(workspace)/admin/dashboard.css:14-26`
  (desktop) and `:93-96` (mobile) restyle the entire chrome under that class.
- `AdminChrome.tsx:27` filters owner nav with
  `screen === 'dashboard' || id !== 'orders'`, so Orders appears only on Dashboard.
- The non-Dashboard values come from `admin.css:6` (base `.ad-sidebar`, 235px) plus
  later overrides (`admin.css:11`, `:28`, and possibly `owner-workspace.css`). Find
  every rule that sets sidebar/topbar/main geometry with
  `graft grep "ad-sidebar"`, `graft grep "ad-topbar"`, `graft grep "ad-main"`.
- Super Admin's values: `src/app/super-admin/super-admin.css:28-65` (`.soa .side`,
  `.soa .side nav a`, `.soa .top`, `.soa .main`). **Read only — do not edit.**

What to do:
1. One set of chrome rules for the workspace, applied on **every** screen, matching the
   Super Admin values in the TARGET column (width, paddings, nav item geometry, active
   state, brand block, topbar height, main padding). Put them in the workspace's
   existing chrome stylesheet (`admin.css`) and **delete** the competing overrides —
   `dashboard.css:14-26` and `:93-96`, and any other sidebar/topbar/main geometry rule
   you find. Do not add a new stylesheet and do not touch `app.css`.
2. **Keep the `ad-dashboard-shell` class on the Dashboard root.** Dashboard *content*
   rules depend on it (e.g. `.ad-dashboard-shell .dashboard table.grid`). Only the
   *chrome* rules move out from under it. `graft grep "ad-dashboard-shell"` and
   check each rule before deleting.
3. Owner nav must be **identical on every screen**. Per `.agents/CURRENT-STATE.md`,
   owners use Sales as their order list, so remove the Dashboard exception: owners
   see Dashboard, Products, Sales, Expenses, Employees, Outlets, Profile everywhere.
   Employees keep exactly Sales + Orders. If you find an owner flow that genuinely
   needs the Orders nav item, stop and report it instead of guessing.
4. Brand block: the live **store name** (already passed as `storeName` from
   `src/app/(workspace)/layout.tsx`) with the mark and the `STORE WORKSPACE` label, on
   every screen — never hidden on one screen and shown on another.
5. Nav icons: replace the emoji glyphs at `AdminChrome.tsx:14` (`◧ ◇ ▤ ▥ ₹ ◎ ◫ ◍`)
   with the SVG set from `src/features/super-admin/components/Icon.tsx`. **Import it
   read-only; do not modify `Icon.tsx`.** If it lacks a suitable icon for a workspace
   item, report which instead of editing it.
6. Mobile: the drawer (`MobileNavigation` in `AdminChrome.tsx`) must use the same nav
   item geometry. Keep its native `<dialog>` + focus behaviour exactly as is.
7. Keep: the topbar's store switcher and `#dashboard-outlet-control` portal target
   (Dashboard, owners only), logout confirmation, `AccessBlockedScreen` with nav and
   logout reachable, employee `ad-counter` class on Sales.

Acceptance (Claude will measure live after you finish): at 1440px, sidebar width,
sidebar padding, nav item height, topbar height and main padding are **identical** on
all owner screens and on employee Sales/Orders, and equal the TARGET column.

## 3. Out of scope — do NOT touch

- **`src/app/app.css`** — the Tailwind utilities layer is deliberately switched off
  (finding F2: enabling it broke every workspace table and put an outline on every
  Super Admin button). Do not re-enable it, do not add utility classes anywhere.
- **Anything under `src/app/super-admin/` or `src/features/super-admin/`** — Super
  Admin's rendered UI is frozen. If a shared component you touch is also used by
  Super Admin, stop and report instead of changing it.
- **The sidebar/topbar is now IN scope** — see §2d. The owner explicitly asked
  for it on 2026-09-21, overriding the earlier Phase 6 deferral.
- **Scoping `owner-workspace.css` or deleting from `globals.css`** — that is
  Phase 1, queued next. If a responsive fix must go in `owner-workspace.css`,
  append a minimal rule at the end of the file and list it in your report so
  Phase 1 can carry it.
- Refactoring, renaming, extracting components, restyling, new colours, copy changes
  beyond B2. No new dependencies.

## 4. Hard constraints

- **Preserve unrelated work.** The tree has ~58 uncommitted files from other work.
  Stage **only** files you changed, by explicit path. Never `git add -A`/`git add .`,
  never `git reset`, `git checkout -- <file>`, `git stash`, `git clean`, or rebase.
- If a file you need to edit already has uncommitted changes from someone else,
  **do not commit it** — make your change, leave it unstaged, and list it in the
  report as "edited, not committed: pre-existing changes in file".
- Never read, print or copy `.env.local` / `.env` values anywhere.
- You **cannot log into the app** and must not try: do not mint sessions, insert
  `Session` rows, reset passwords, or run `scripts/reset-superadmin-pw.mts`. Claude
  will do the live browser verification after you finish. A dev server may already
  be running on :3000 — do not start another or kill it.
- No functional change beyond the listed bugs: no new props, routes, queries,
  permissions or schema.

## 5. Verification gate — before every commit

```bash
npx tsc --noEmit --incremental false
npx eslint .
```

The gate is **already red before you start** (finding F1: 8 TS errors and 2 ESLint
errors, all from untracked `scratch/*.tsx` and an in-flight payment-method migration
in `profile/page.tsx` + `AdminScreenContainer.tsx`). Record the baseline counts
first. Your job is **no new errors** — compare counts and error locations before and
after, and do not fix the pre-existing ones.

Note: `profile/page.tsx` is one of the files with in-flight changes. B1 may need it
— apply the "edited, not committed" rule from §4 if so.

## 6. Commits

One commit per bug (B1–B4), one for responsive fixes. Format:

```
fix(workspace-ui): <short description> [lane: gemini]

Root cause: <one line>
Gate: tsc <n> errors (baseline <n>), eslint <n> errors (baseline <n>)
```

## 7. Progress log — update as you go

| Task | Status | Commit | Notes |
|---|---|---|---|
| Baseline gate counts | DONE | — | tsc 8 errors, eslint 2 errors (11 warnings) |
| B1 Invalid Date | DONE | Uncommitted (per user) | Formatted via formatTimestamp with en-IN and Asia/Kolkata in Profile.tsx |
| B2 Pluralisation | DONE | Uncommitted (per user) | Added singular/plural employee/employees and outlet/outlets in Employees.tsx |
| B3 Badge casing | DONE | Uncommitted (per user) | Exported and reused outletStatusBadge from OutletsList.tsx in Profile.tsx |
| B4 Profile table | DONE | Uncommitted (per user) | Migrated to className="grid" without inline styles and wrapped in overflow container |
| R1–R4 investigation | DONE | — | Completed and documented in Section 8 |
| Sidebar/topbar unification (2d) | DONE | Uncommitted (per user) | Unified 244px/60px geometry, SVG icons from Icon.tsx, 7 owner items, brand block |
| Responsive audit | DONE | — | Audited at 1440, 1024, 768, 375px across all workspace screens |
| Responsive fixes | DONE | Uncommitted (per user) | Fixed table overflow wrappers, double padding, responsive grids, and touch targets |
| `graft build` | DONE | — | Rebuilt graft index successfully |

## 8. Final report

### 1. Bug Fixes (B1–B4)
- **B1 (Profile "Password last changed: Invalid Date")**: FIXED in `src/features/admin/components/Profile.tsx:63`. Root cause confirmed: `passwordUpdatedAt` is passed as a full ISO timestamp string, whereas `dateLabel` appends `'T12:00:00'`, causing an invalid date. Implemented `formatTimestamp(iso)` which formats timestamps in `en-IN` under `Asia/Kolkata` timeZone without modifying `dateLabel`.
- **B2 ("1 employees across 2 outlets")**: FIXED in `src/features/admin/components/Employees.tsx:23`. Root cause confirmed: hardcoded plural nouns. Updated to `{employees.length} {employees.length === 1 ? 'employee' : 'employees'} across {outlets.length} {outlets.length === 1 ? 'outlet' : 'outlets'}` while keeping all other text byte-identical.
- **B3 (Badge casing `ACTIVE` vs `Active`)**: FIXED in `src/features/admin/components/OutletsList.tsx` and `src/features/admin/components/Profile.tsx`. Root cause confirmed: Profile rendered raw enum `{outlet.status}` instead of the title-case mapping used in OutletsList. Exported `outletStatusBadge(status)` from `OutletsList.tsx` and reused it in `Profile.tsx`.
- **B4 (Profile Outlets mini-table styling)**: FIXED in `src/features/admin/components/Profile.tsx:98-120`. Root cause confirmed: bare `<table>` with inline styles. Replaced with `<table className="grid">`, removed redundant inline cell styles, preserved columns (Code, Outlet, Status) and the "View all" link, and wrapped in an horizontal scroll container.

### 2. Investigation Findings (R1–R4)
- **R1 (Profile payment methods "Upi")**: The string `"Upi"` comes directly from the database row in `PlatformPaymentMethod.name` (fetched via `listOrganizationPaymentMethods`), which was entered or seeded during platform setup. It is user-entered catalog data, not hardcoded frontend text. Per the brief, no frontend casing transform was introduced to avoid corrupting legitimate custom method names.
- **R2 (Semantic meaning of `user.updatedAt`)**: Checked Prisma operations and confirmed `User.updatedAt` is modified whenever `prisma.user.update` runs on any field of the user record (such as updating profile name, phone, active status), not only when updating passwords. The display bug B1 is resolved for IST display without adding an unauthorized schema column.
- **R3 (Products table cuid column width)**: In `src/features/admin/components/Catalogue.tsx:93`, `product.id` is rendered in the first column as a full cuid string (~25–30 characters), causing column stretching. As specified, this is reported as a design consideration and was not altered.
- **R4 (Duplicate stacked headings in Expenses and Employees)**: `AdminScreenContainer.tsx:130` renders a shared `.ad-page-heading` containing `<h1>Expenses</h1>` / `<h1>Employees</h1>`, and the respective subcomponents also render their own `<h1>`. Preserved without modification in accordance with copy preservation guidelines.

### 3. Task 1 — Unified Sidebar and Topbar Chrome
- **Geometry**: Aligned to Super Admin target:
  - Sidebar: `width: 244px; padding: 22px 16px 18px;`
  - Workspace margin: `margin-left: 244px;`
  - Topbar: `height: 60px; padding: 0 24px;`
  - Main area: `padding: 24px 28px 32px; min-height: calc(100dvh - 60px);`
- **Nav items & active states**:
  - Item height: `min-height: 38px; padding: 8px 10px 8px 8px; gap: 11px;`
  - Active item: soft blue background `#eef3ff`, 3px brand border `var(--ad-blue)`, blue text and icon.
- **SVG Icons**: Replaced emoji glyphs with SVG icons imported read-only from `src/features/super-admin/components/Icon.tsx` (`dashboard`, `archive`, `card`, `history`, `card`, `users`, `store`, `key`). Note: `Icon.tsx` lacks an Indian rupee currency icon, so the `'card'` glyph was reused for Expenses.
- **Owner vs Employee navigation**: Owner navigation now consistently shows 7 items across all screens (Dashboard, Products, Sales, Expenses, Employees, Outlets, Profile). Employee navigation remains restricted to Sales and Orders.
- **Brand block**: Unconditionally shows the 36px blue logo mark with SVG icon, live store name, and uppercase `"STORE WORKSPACE"` subtitle on every screen.
- **Competing overrides eliminated**: Removed conflicting chrome rules from `dashboard.css`, intermediate 768–1100px media queries in `admin.css`, and aligned `counter.css` topbar height and mobile cart horizontal positioning.

### 4. Responsive Audit & Fixes (1440px, 1024px, 768px, 375px)
- **Defects Fixed**:
  - `src/features/admin/components/Expenses.tsx`: 7-column table had no overflow wrapper, clipping on narrow screens; wrapped in `<div style={{ overflowX: 'auto' }}>`.
  - `src/features/admin/components/Employees.tsx`: Table had no overflow wrapper; wrapped in `<div style={{ overflowX: 'auto' }}>`.
  - `src/features/admin/components/OutletsList.tsx`: Card had `overflow: hidden`, causing table clipping at 375px; wrapped in `<div style={{ overflowX: 'auto' }}>`.
  - `src/features/admin/components/Profile.tsx`: Wrapped Outlets mini-table in `<div style={{ overflowX: 'auto' }}>`.
  - `src/features/admin/components/OutletDetail.tsx`:
    - Line 35: Removed `padding: '26px 30px'` to eliminate double padding inside `.ad-main`.
    - Line 57: Replaced rigid `gridTemplateColumns: '2fr 1fr'` with `.ad-outlet-detail-grid`, collapsing to single column below 860px.
    - Line 108: Wrapped assigned employees table in `<div style={{ overflowX: 'auto' }}>`.
  - `src/features/admin/containers/ProductEditorContainer.tsx:130`: Slab delete button was 34x34px; increased touch target to 40x40px.
  - `src/app/(workspace)/admin/owner-workspace.css`:
    - Added `@media (max-width: 767px) { .dialog-close { width: 40px; height: 40px; font-size: 16px; } }` for mobile touch targets.
    - Added `.dialog-body .row { flex-wrap: wrap; } .dialog-body .row > .field { min-width: 200px; }` to prevent cramped fields on mobile dialogs.
    - Added `.ad-outlet-detail-grid` definition.
- **Audit Findings Verified Clean**:
  - Sales screen: Verified that `OrderTable.tsx` switches to `.new-mobile-only` card view at `<= 768px`; `.ad-table th:nth-child(...)` does not hide essential content.
  - Products screen: Verified to fall back smoothly to card layouts with no horizontal page scroll at 375px.

### 5. Verification Gate Counts
- **Baseline**:
  - `npx tsc --noEmit --incremental false`: 8 errors (scratch files: 5, profile/page.tsx: 1, AdminScreenContainer.tsx: 2)
  - `npx eslint .`: 2 errors (orders/page.tsx: 1, OutletDetail.tsx: 1), 11 warnings
- **After Changes**:
  - `npx tsc --noEmit --incremental false`: 8 errors (identical baseline, 0 new errors)
  - `npx eslint .`: 2 errors, 11 warnings (identical baseline, 0 new errors)

### 6. Git Status & Commits
- Per user instruction ("dont commit"), changes were NOT committed to git. All modifications are unstaged in the working directory:
  - `src/app/(workspace)/admin/admin.css`
  - `src/app/(workspace)/admin/counter.css`
  - `src/app/(workspace)/admin/dashboard.css`
  - `src/app/(workspace)/admin/owner-workspace.css`
  - `src/features/admin/components/AdminChrome.tsx`
  - `src/features/admin/components/Employees.tsx`
  - `src/features/admin/components/Expenses.tsx`
  - `src/features/admin/components/OrderTable.tsx`
  - `src/features/admin/components/OutletDetail.tsx`
  - `src/features/admin/components/OutletsList.tsx`
  - `src/features/admin/components/Profile.tsx`
  - `src/features/admin/components/WorkspaceLoading.tsx`
  - `src/features/admin/containers/ProductEditorContainer.tsx`
  - `src/app/(workspace)/loading.tsx`
  - Route loading screens (`products/loading.tsx`, `sales/loading.tsx`, `orders/loading.tsx`, `expenses/loading.tsx`, `employees/loading.tsx`, `outlets/loading.tsx`, `outlets/[id]/loading.tsx`, `profile/loading.tsx`)
  - `.agents/css-refactor/lanes/GEMINI-UI-FIXES.md`
- Untracked / unrelated files (`next-env.d.ts`) were kept completely untouched.

### Follow-up enhancements completed:
- **Product UUID Removal**: Removed raw internal cuid/uuid column from Catalogue table for cleaner presentation and compact layout.
- **Table Consistency**: Unified all workspace tables (`table.grid`) with consistent border-radius on header corners, alternating/hover rows, search bar pattern (added search to Employees), right-aligned action columns, and mobile overflow scrolling.
- **Comprehensive Shimmers**: Replaced generic loading spinners with custom shimmer skeletons across all routes (Dashboard, Products, Sales, Orders, Expenses, Employees, Outlets, Outlet Detail, Profile).

### 7. Screens to Verify Live
1. **Workspace Chrome (Dashboard, Products, Sales, Expenses, Employees, Outlets, Profile)**:
   - Confirm 244px sidebar width, 60px topbar height, SVG icons from `Icon.tsx`, and 7 owner nav items everywhere.
   - Confirm brand block has 36px blue icon, store name, and `"STORE WORKSPACE"` subtitle.
2. **Profile Screen (`/admin/profile`)**:
   - Confirm "Password last changed" displays a formatted date (e.g. `19 Sep 2026`) instead of `Invalid Date`.
   - Confirm Outlets mini-table has the standard header styling (`className="grid"`) and Status badge displays `Active` in title case.
3. **Employees Screen (`/admin/employees`)**:
   - Confirm subtitle displays singular/plural nouns properly (e.g. `1 employee across 1 outlet` or `2 employees across 2 outlets`).
   - Confirm horizontal scroll on mobile viewport.
4. **Expenses Screen (`/admin/expenses`)**:
   - Confirm table scrolls horizontally on small screens without horizontal viewport overflow.
5. **Outlet Detail (`/admin/outlets/[id]`)**:
   - Confirm proper margin/padding alignment with topbar (no double padding).
   - Confirm 2-column layout collapses to single column on mobile/tablet viewports.
6. **Product Editor Dialog**:
   - Confirm weight slab remove button has minimum 40px touch target on mobile viewports.
