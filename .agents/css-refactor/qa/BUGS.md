# Workspace QA — consolidated bug list

Date: 2026-09-21. Owner session, store "Reddy's Laundry".
Sources: `desktop.md` (1440/1024px) and `mobile.md` (375/768px) — full evidence per bug
lives there. This file de-duplicates and ranks them.

"Verified" = the parent agent re-checked the root cause in source, independent of the
QA agent that reported it.

## Pre-conditions confirmed before the sweep
- Sidebar/topbar identical on all 7 owner screens (244px sidebar, 60px topbar,
  24/28/32 main padding, 7 SVG items) — measured live after Gemini's lane.
- No horizontal page scroll on any screen at 375, 768, 1024 or 1440.
- No failed network requests; the only console errors trace to Q-01.

## Bugs

| ID | Sev | Screen | Widths | Bug | Source | Verified | From |
|---|---|---|---|---|---|---|---|
| **Q-01** | **S1** | Employees → Edit | all | `disabled={!employee}` is inverted. On **edit** the "Temporary password" field is enabled with a fixed `value="Leave blank to keep current"`, so it can't be typed in, yet it submits — line 33 sends that literal string as the new password. **Any edit to an employee resets their password to "Leave blank to keep current" and signs them out.** On create it is disabled, the one case it should accept input. | `EmployeeEditor.tsx:56`, `:33` | ✅ | D-01, M-01 |
| Q-02 | S2 | Sales → order details | all | Status stepper is a 3-column grid but there are 4 statuses (Pending / In Progress / Ready / Delivered), so "Delivered" wraps under "Pending" — a finished order reads as stuck. | `tables.css:145` | ✅ | D-02 |
| Q-03 | S2 | Dashboard | 375 | Outlet-switcher dropdown is `position:absolute; left:0` with no right bound; overflows the viewport edge by ~40px, last option partly untappable. | `owner-workspace.css` `.switcher-menu` | ✅ | M-02 |
| Q-04 | S2 | Sales → order details | 375 | "Payment summary" card shrinks to 225px (siblings 343px): desktop `align-items:start` (line 26) persists when the mobile rule (line 127) switches the container to a flex column. | `tables.css:26`, `:127` | ✅ | M-03 |
| Q-05 | S2 | Employees → Outlets multi-select | 375, 768 | Checkbox rows stack checkbox above label, centred: generic `.ad-root label{flex-direction:column}` beats the component's row layout. | `admin.css:5` | ✅ | M-06 |
| Q-06 | S2 | Employees list | 375, 768 | No mobile fallback (Sales/Products have one); name column squeezed to ~68–90px, heavy wrapping, actions pushed out. | `Employees.tsx` | — | M-04 |
| Q-07 | S2 | Outlets list | 375, 768 | Same as Q-06 for Outlets. | `OutletsList.tsx` | — | M-05 |
| Q-08 | S2 | Dashboard → sales chart | all | Empty window still draws a fabricated ₹100 / ₹66.7 / ₹33.3 axis beside "No booked sales in this period". | see desktop.md D-05 | — | D-05 |
| Q-09 | S2 | Sales | 1440, 1024 | No outlet indicator or switcher on an outlet-scoped screen — the owner can't tell which outlet's sales they're viewing. | see desktop.md D-06 | — | D-06 |
| Q-10 | S3 | Products → Add service | all | Submit button reads "Save changes" when creating. | see desktop.md D-07 | — | D-07 |
| Q-11 | S3 | Profile → Edit profile | all | Phone field's accessible name comes from its `title` ("Enter a valid phone…") rather than its label. | see desktop.md D-08 | — | D-08 |
| Q-12 | S3 | Employees → Outlets multi-select | 375 | Checkbox rows 24px tall (touch target < 40px). | see mobile.md M-08 | — | M-08 |
| Q-13 | S3 | Topbar | 375 | Avatar button 35×35px (< 40px). | see mobile.md M-09 | — | M-09 |
| Q-14 | S3 | Expenses | 375 | Outlet filter pills 35px tall (< 40px). | see mobile.md M-10 | — | M-10 |

## Needs manual recheck — likely a test-automation artefact, not a bug
| ID | Observation | Why unconfirmed |
|---|---|---|
| Q-15 | Escape didn't close the **New sale** panel (D-04) or the **mobile nav drawer** (M-07). | Both use native `<dialog>` `cancel` handling. The mobile agent fired the native `cancel` event by hand and the app's handler closed the drawer correctly — synthetic Escape key events don't trigger `cancel` in this browser automation. Press Escape by hand once on each to confirm. |

## Needs a product decision
| ID | Question |
|---|---|
| P-01 | "By weight" Add service pre-fills ₹279 / ₹379 / ₹49 slabs as real **values** (D-03, also noted by mobile). Placeholders instead? A careless save currently creates a priced service the owner never typed. |
| P-02 | Earlier report-only items R1–R4 in `lanes/GEMINI-UI-FIXES.md` (Upi data casing, `updatedAt` as "password last changed", full cuids on Products, duplicated headings). |

## Not covered
- **Employee role** (Sales/Orders as `emp_01`) — the browser holds an owner session.
- **Super Admin** — out of scope for this sweep; frozen pending the Phase 0 baseline.
- Full keyboard tab-order walk on desktop (the browser pane was hidden mid-run; layout was verified by DOM measurement instead).
