# UI review — brief (2026-09-22)

Two ruthless QA reviewers, owner workspace only (Super Admin is frozen —
out of scope). Findings only; **no code changes**.

| Lane | Viewport | Report file | Status |
|---|---|---|---|
| Desktop | 1440×900 (plus a 1024×768 pass) | `desktop.md` | DONE |
| Mobile | 375×812 (plus a 390×844 / 360×740 spot-check) | `mobile.md` | DONE |

## Screens (visit every one, plus every panel/dialog it opens)
1. Dashboard `/` — range control, outlet control, KPI tiles, charts, empty states
2. Products `/admin/products` — list/cards, search, Add service editor (item + weight/slab), edit existing
3. Sales `/admin/sales` — KPIs, filters, register, **New sale** panel (outlet picker, services, Paid in full, footer), order details (Bill / Invoice card)
4. Orders `/admin/orders` — filters (outlet multi-select, status, dates, search), table, order details dialog
5. Expenses `/admin/expenses` — list, filters, Add expense editor, mark-paid confirm
6. Employees `/admin/employees` — list/cards, Add / Edit employee, Outlets disclosure
7. Outlets `/admin/outlets` and one outlet detail `/admin/outlets/<id>`
8. Profile `/admin/profile` — edit profile, change password dialog, payment methods, outlets
9. App chrome — sidebar (desktop) / drawer (mobile), topbar, outlet switcher, toasts, loading states, logout **confirmation** (open it, then Cancel)

## Hard rules
- Open your **own tab** (`tabs_create`) and pass its `tabId` on every browser
  call; the other reviewer shares the same browser pane. Never touch tab `seed`.
- **Read-only**: open forms and dialogs, type into fields to test validation,
  then Cancel / Discard. Never click Save, Submit, Record payment, Update
  status confirm, Mark paid, Deliver anyway, Deactivate, or Log out.
  Never change the outlet switcher's value.
- Reset any viewport emulation on your tab when finished.
- Don't read `.env*`. Use `graft ask/grep/skeleton` if you need source context.

## What to hunt (no mercy)
Visual inconsistency across screens (spacing, type scale, radii, button
styles/sizes, icon styles, heading hierarchy, table vs card patterns, empty
states), alignment, truncation/overflow/wrapping, touch targets (< 44px on
mobile), focus visibility and keyboard traps, contrast, confusing copy/labels,
duplicated labels, missing feedback (loading, success, error), dead or
misleading controls, inconsistent dropdowns/selects (native vs shared),
modal/panel behaviour, layout shift, anything that makes a counter operator
slow or error-prone.

## Report format (per screen)
`### <Screen>` then one row per finding:
`| ID | Severity (P0 blocker / P1 major / P2 minor / P3 polish) | Where (element) | What's wrong | Evidence (measured px / computed style / exact text) | Suggested fix |`
IDs: `D-01…` desktop, `M-01…` mobile. End with a "Top 10 to fix first" list
and a count by severity. Evidence must be measured or quoted, not guessed.
