# Mobile QA — owner workspace (375px / 768px)

Scope: owner workspace only, mobile (375px) and tablet (768px) widths, against
the live dev server (localhost:3000), signed in as the owner of "Reddy's
Laundry" (2 outlets: Chinnapnahalli, HSR Layout). Read-only session — no
saves/deletes/toggles performed. Desktop widths (1440/1024) are covered by a
parallel agent.

## Bugs

| ID | Sev | Screen | Width | Bug | Evidence | Source (file:line) | Suggested fix |
|---|---|---|---|---|---|---|---|
| M-01 | S1 | Employees, Add/Edit employee dialog | 375, 768 (all widths) | The "Temporary password" input on **Edit employee** is a controlled React field with `value=` set but no `onChange`/`readOnly`, so it looks enabled but silently rejects all keystrokes — an owner can click into it, type a new temp password, and it visibly does nothing (reverts to the placeholder text). | React console error captured via `read_console_messages`: `"You provided a value prop to a form field without an onChange handler. This will render a read-only field..."`, triggered by opening Edit employee. `disabled={!employee}` evaluates to `false` when editing (i.e. not actually disabled), yet the field never accepts input. | `src/features/admin/components/EmployeeEditor.tsx:56` — `<input name="password" disabled={!employee} value={employee ? "Leave blank to keep current" : ...} .../>` | Use `readOnly` (or `defaultValue`) instead of an unmanaged `value`, or genuinely `disabled` the field when editing. |
| M-02 | S2 | Dashboard | 375 | The outlet-switcher dropdown ("📍 All outlets ▾") renders left-anchored to its trigger button with `min-width:230px` and no viewport-edge clamping. At 375px the trigger sits mid-topbar, so the menu's right edge lands at x≈415 — 40px past the 375px viewport edge — with no scroll available to reach it. The "Reddy's Laundry – HSR Layout" option is visually cut off and its clickable area is partly unreachable by touch. | Measured via `getBoundingClientRect()`: option rect `{left:198.7, right:414.7}` while `document.documentElement.clientWidth = 375` and `scrollWidth = 375` (confirms it's an invisible/unreachable overflow, not a scrollable one). Screenshot shows "Reddy's Laundry – HSR La" cut off at the screen edge. | `src/app/(workspace)/admin/owner-workspace.css:45-51` (`.switcher-menu{position:absolute;left:0;min-width:230px;...}`, no `right`/`max-width` clamp); component: `src/features/admin/components/ui/OutletSwitcher.tsx:64-80` | Clamp the menu with `right:0;left:auto` when it would overflow, or `max-width:calc(100vw - 32px)` plus `overflow-x:hidden` fallback; reposition via JS (flip to right-aligned) on narrow viewports. |
| M-03 | S2 | Sales → order detail dialog (View order) | 375 | In the order detail panel, the "Payment summary / Payments received" card does not stretch to the same width as its sibling cards (Items, Status history) — it shrinks to its content width (225px vs 343px), leaving a large blank gap to the right. Caused by a stray `align-items:start` (written for the desktop CSS-grid layout) leaking into the mobile flex-column layout of the same selector, which also re-centers each row's content (checkbox-above-text look) instead of stretching it. | Measured: sibling `.ad-detail-section` rects — Items `width:343`, Payments-received `width:225.09`, Status history `width:343`. `getComputedStyle` on the Payments-received section's parent (`.ad-detail-summary`) shows `display:flex; flexDirection:column; alignItems:"start"`. Confirmed NOT present at 768px (same dialog there uses `display:grid`, width 100% correctly) — genuinely mobile-only. Screenshot shows the narrow card with blank space to its right. | `src/app/(workspace)/admin/admin.css:5` (`.ad-root label{...}` not the cause here — see next) — actual cause: `.ad-detail-summary{display:grid;grid-template-columns:...;align-items:start}` at `src/app/(workspace)/admin/tables.css:26`, whose `align-items:start` is never reset by the later mobile-flex override at `src/app/(workspace)/admin/tables.css:127` (`.ad-detail-main,.ad-detail-summary{display:flex;flex-direction:column;gap:18px}`, no `align-items` declared, base 220px, ) | Add `align-items:stretch` to the mobile/readable-scale `.ad-detail-summary` rule (or scope the base `align-items:start` to the grid breakpoints only) so flex children fill the column width. |
| M-04 | S2 | Employees list | 375, 768 | The Employees table has no mobile card/list fallback — it stays a raw `<table>` in a horizontally-scrolling `overflow-x:auto` wrapper. The Name column is squeezed to ~68-90px, wrapping "Employee 1" into "Emplo/yee 1" even at 768px where the card has plenty of unused width to the right, and the Deactivate/Manage actions are pushed off-screen, requiring a finger-drag scroll inside the table to reach them (inconsistent with Sales/Products/Expenses, which all use stacked cards on mobile). | Measured: table `scrollWidth:438` vs wrapper `clientWidth:303` at 375px (contained scroll, confirmed via `overflowX:auto`). Screenshot shows "Emplo/yee 1" wrapped and Deactivate/Manage cut off until scrolled. Same wrap observed at 768px with ~500px of unused white space beside the table. | `src/features/admin/components/Employees.tsx:50-96` (`<div style={{overflowX:'auto'}}><table className="grid">...`) | Add a `@media(max-width:767px)` card layout for the employee rows, matching the pattern already used for Products/Sales (e.g. `.catalogue-cards` in `owner-workspace.css`). |
| M-05 | S2 | Outlets list | 375 (worse), 768 (milder) | Same missing-mobile-fallback pattern as M-04, more severe: the "Outlet" name column is only 68px wide at 375px, so "Reddy's Laundry - Chinnapnahalli" wraps into 7 short lines (breaking mid-word: "Reddy'" / "s" / "Laund" / "ry –" / "Chinn" / "apnah" / "alli"), while Code/Status/Opened/View sit in a horizontally-scrolled-away region. | Measured: first `<td>` `getBoundingClientRect().width = 68px` for a 33-character name; table `scrollWidth:407` vs wrapper `clientWidth:341`. Screenshot shows the 7-line wrap. At 768px the same column still wraps ("Chinnapnahal/li") despite ample free width in the card. | `src/features/admin/components/OutletsList.tsx:33-71` (`<div style={{overflowX:'auto'}}><table className="grid">...`, no `min-width`/`white-space` on the name `<td>`) | Same as M-04: mobile card fallback, or at minimum a `min-width` on the name column plus `white-space:normal` word-break tuned to break only at existing separators. |
| M-06 | S2 | Employees → Edit employee → "Active outlets" dropdown (MultiSelectDropdown, also used elsewhere the component appears) | 375, 768, likely all widths | Checkbox rows inside the outlet multi-select ("All outlets", "Reddy's Laundry – Chinnapnahalli", …) render as a centered column (checkbox stacked above the label text, both horizontally centered) instead of the intended checkbox-left/label-right row. Caused by the generic `.ad-root label{display:flex;flex-direction:column}` rule winning over `.dropdown-check-row`'s row-oriented styles (which never declares its own `flex-direction`, so it has nothing to override the generic one with) — and `.dropdown-check-row`'s `align-items:center` then centers each stacked item on the cross (horizontal) axis. | `getComputedStyle` on the "All outlets" `<label class="dropdown-check-row">`: `display:"flex"`, `flexDirection:"column"` (expected `"row"`), rect `height:85` for a single checkbox+text row (should be ~36px). Screenshot shows the checkbox centered above the centered "All outlets" text. | Conflict between `src/app/(workspace)/admin/admin.css:5` (`.ad-root label{display:flex;flex-direction:column;...}`) and `src/app/(workspace)/admin/owner-workspace.css:365-375` (`.dropdown-check-row{display:flex;align-items:center;...}`, no `flex-direction`) | Add `flex-direction:row` explicitly to `.dropdown-check-row` (and any other non-field `<label>` component) so it isn't at the mercy of the generic `.ad-root label` default. |
| M-07 | S3 | Mobile nav drawer | 375 | Escape-to-close could not be conclusively verified via automation: two synthetic `Escape` key presses (viewport confirmed steady at 375px, dialog stayed open, `dialog.open` remained `true`) did not close the drawer, but manually dispatching a `cancel` `Event` on the same `<dialog>` element closed it correctly and returned focus to ☰ — proving the app's own `onCancel` handler (`e.preventDefault(); onClose();`) is wired correctly. This looks like a browser-automation limitation (synthetic key events not reaching the native `<dialog>` cancel path) rather than a real app bug, so it's flagged for a manual re-check rather than filed as a confirmed defect. | `dialog.open` stayed `true` across two `key:"Escape"` presses at steady `innerWidth:375`; dispatching `new Event('cancel', {cancelable:true})` directly on the dialog closed it immediately (`open:false`, drawer removed from DOM). Backdrop click and the × button both closed the drawer correctly with focus returning to ☰. Resize 375→1024 with the drawer open also closed it correctly via the `matchMedia` listener. | `src/features/admin/components/AdminChrome.tsx:51-66` (`MobileNavigation`, `onCancel` handler) | No code change indicated from this evidence; re-verify Escape manually on a real device/browser before treating as a defect. |
| M-08 | S3 | Dashboard, Add expense dialog ("Repeat monthly" / "Already paid today"), Change password ("Show passwords") | 375 | Checkbox rows in plain `.ad-checkbox`-style forms measure only 24px tall as clickable `<label>` targets, under the 40×40px touch-target guideline (the checkbox itself is 18×18px per CSS). | Measured: `<label>` for "Repeat monthly" / "Already paid today" both `{width:301, height:24}` via `getBoundingClientRect()`. | `src/app/(workspace)/admin/admin.css:8` (`.ad-checkbox{...}`, no `min-height`) | Add `min-height:40px` (or equivalent padding) to `.ad-checkbox` / other bare checkbox-row labels. |
| M-09 | S3 | Dashboard topbar | 375 | The owner's avatar button ("G") measures 35×35px, under the 40×40px touch-target guideline (the ☰ hamburger next to it is a correct 40×40px). | Measured via `getBoundingClientRect()`: avatar button `{w:35, h:35}`; hamburger `{w:40, h:40}` for comparison. | Topbar avatar button in `src/features/admin/components/AdminChrome.tsx` (topbar section) | Increase the avatar button's padding/size to at least 40×40px. |
| M-10 | S3 | Expenses, outlet filter pills ("All" / "Organization-wide" / "Reddy's Laundry – …") | 375 | The horizontally-scrolling outlet-filter pill row's buttons measure 35px tall, under the 40px touch-target guideline. The row itself scrolls correctly within its own container (`overflow-x:auto`, not a page-level scroll bug), so this is a touch-target-only finding, not a layout break. | Measured via `getBoundingClientRect()`: pill buttons all `height:35`; container `scrollWidth:692` vs `clientWidth:303`, `overflowX:"auto"` (contained, not a bug in itself). | Expenses outlet-tab pills (Expenses screen, outlet filter component under `src/features/admin/components/`) | Increase pill vertical padding to reach 40px min-height. |

## Needs a product decision

- Switching "Add service" (Products) from **Per item** to **By weight (slabs)**
  pre-fills example slab values (4kg/₹279, 6kg/₹379, extra ₹49) rather than
  blank fields. This is identical on desktop (not a responsive/mobile bug) and
  may be an intentional starter template — flagging rather than filing, since
  it isn't width-specific and a parallel Desktop QA agent would see the same
  thing. Source: `src/features/admin/containers/ProductEditorContainer.tsx`
  (`useState` defaults for `slabs`/`extra`).

## Screens × widths covered

Dashboard, Products (+ Add service in both charging modes, Edit an existing
service, Cancel), Sales (+ New sale dialog/cart, order detail view, filters),
Expenses (+ Add expense dialog, outlet tabs), Employees (+ Add employee,
Manage/Edit, Outlets multi-select disclosure — no saves), Outlets (+ outlet
detail via View), Profile (+ Edit profile, Change password, both Cancelled;
Payment methods and Outlets summary viewed only, not touched) — all at 375px.
A second pass at 768px covered Dashboard, Sales (+ order detail dialog),
Outlets, and Employees to confirm which 375px findings persist. `/admin/orders`
was not a distinct route in this build (Sales serves the order list for the
owner); no separate check was needed.

### Horizontal scroll — 375px

| Screen | Horizontal scroll |
|---|---|
| Dashboard | No |
| Products (list + Add/Edit service dialogs) | No |
| Sales (list + New sale + order detail dialogs) | No |
| Expenses (list + Add expense dialog) | No |
| Employees (list + Add/Edit dialogs) | No (page-level) — table itself scrolls inside its own wrapper (see M-04) |
| Outlets (list + detail) | No (page-level) — table itself scrolls inside its own wrapper (see M-05) |
| Profile (+ Edit profile, Change password dialogs) | No |
| Mobile nav drawer | No |

### Horizontal scroll — 768px

| Screen | Horizontal scroll |
|---|---|
| Dashboard | No |
| Sales (+ order detail dialog) | No |
| Outlets | No |
| Employees | No (page-level) — table still doesn't reflow into a card, just has more slack (see M-04) |

Note: at 768px the workspace already renders the full desktop-style persistent
sidebar (no hamburger/drawer) — the CSS breakpoint for the mobile nav is
`max-width:767px`, so 768px is effectively the same chrome as desktop. This
is expected, not a bug, but means the drawer-specific checks in this brief
only apply at 375px.

## Could not fully test

- **Escape-to-close on the mobile nav drawer** — see M-07. Automation
  evidence is ambiguous (native `<dialog>` cancel event vs. synthetic
  `Escape` key dispatch); the app's own handler is verified correct by
  directly firing the `cancel` event, so this needs a manual recheck on a
  real touch device/browser rather than headless automation.
- Toggling any payment method, saving any form, deactivating/reactivating
  employees, and Log out were intentionally not exercised (read-only
  constraint / shared session).
- Did not check `/admin/orders` as a separate route — this build routes the
  owner's order list through `/admin/sales`, so no distinct screen exists to
  test there.

## Totals

- S1: 1 (M-01)
- S2: 5 (M-02, M-03, M-04, M-05, M-06)
- S3: 4 (M-07 — flagged as inconclusive/likely non-bug, M-08, M-09, M-10)
- Total filed: 10 (9 confirmed + 1 inconclusive), plus 1 item in "Needs a
  product decision"
