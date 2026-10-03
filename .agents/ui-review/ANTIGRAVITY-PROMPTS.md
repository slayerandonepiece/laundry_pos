# Antigravity fix prompts — owner workspace UI review (2026-09-22)

Source findings: [`desktop.md`](desktop.md) (D-01…D-52) and [`mobile.md`](mobile.md)
(M-01…M-11). This file holds one **shared preamble** plus **10 module prompts**
(M0–M9). Run them **in order, one module per session**. Each prompt is
self-contained: paste the preamble + one module block into Antigravity.

Progress lives in [`FIX-STATUS.md`](FIX-STATUS.md) (create it in M0 if missing)
so work survives a session running out of tokens.

---

## SHARED PREAMBLE (paste at the top of every module prompt)

```text
You are fixing UI/UX and data-correctness findings in the Express Laundry
store workspace (Next.js 16 App Router, React 19, TypeScript, Prisma 7,
Postgres/Neon). Repo root: /Users/reddygona/Documents/skills/laundry_pos.

READ FIRST (in this order):
1. AGENTS.md, GEMINI.md, .agents/README.md, .agents/CURRENT-STATE.md
2. .agents/ui-review/ANTIGRAVITY-PROMPTS.md (this pack) and FIX-STATUS.md
3. The finding rows for your module in .agents/ui-review/desktop.md and
   .agents/ui-review/mobile.md — each row has measured evidence and a
   suggested fix. Re-verify every finding before fixing it; if it no longer
   reproduces, mark it "not reproducible" in FIX-STATUS.md with evidence.

CONTEXT TOOLS — use them before opening source files:
- graft (repo context graph, already built in ./graft):
    graft ask "<question or identifier>" --source   -> ranked nodes + code spans
    graft grep "<literal>"                           -> EXHAUSTIVE occurrences
    graft skeleton <file>                            -> signatures, ~10x cheaper
    graft callers <symbol> [--direction out] [--depth N]  -> blast radius
  Use `graft callers` before changing any shared component/function signature.
  Run `graft build` after your module's changes land.
- LLM Wiki (.wiki/): durable project knowledge (architecture, business rules,
  conventions). Start at .wiki/_index.md, then open the linked pages under
  .wiki/wiki/. Treat it as point-in-time: verify against source before
  relying on it. Do NOT write git/task status into the wiki.
- Next.js docs bundled at node_modules/next/dist/docs/ — read the relevant
  page before using any Next API (this Next version has breaking changes).
- Browser: use your built-in browser against the running dev server at
  http://localhost:3000 (do NOT start another dev server; if it's down, stop
  and ask the user). If the page shows /login, STOP and ask the user to sign
  in — never type, read, or store credentials.

HARD RULES:
- Scope = owner/employee workspace only. Super Admin (/super-admin/**,
  src/features/super-admin/**, src/app/super-admin/**) is FROZEN — no
  visual or code changes there, including shared CSS it consumes.
- The working tree has uncommitted work from earlier rounds. Do not revert,
  reformat, or "clean up" anything outside your module's findings.
- Surgical changes: every changed line must trace to a finding ID in your
  module. No speculative features, no drive-by refactors. Match the
  surrounding code style (compact JSX, existing .ad-* / .soa-free classes,
  money()/dateLabel() helpers, Button/Badge/Panel/Dialog primitives,
  SingleSelectDropdown / MultiSelectDropdown in components/ui/Dropdown.tsx).
- Reuse shared components; never add a second one-off version of a control
  that already exists (dropdown, dialog, button, KPI tile, empty state).
- Server is authoritative: any rule you enforce in the UI (payment methods,
  outlet access, totals) must match what the server validates/computes.
- Never read or print .env* values. Never mint sessions or bypass auth.
- Test data only: when a check needs a write (e.g. create an order), use the
  QA records (orders EL-3/EL-4, products "QA Shirt Press"/"QA Bulk Wash") or
  create new ones named "QA …". Never edit/deliver/pay real orders (EL-1,
  EL-2, EL-5) and never deactivate a real employee or payment method.
- Do NOT commit. Leave changes in the working tree for owner review. If the
  user later asks you to commit: `git add -- <paths>` then
  `git commit -- <paths>` (explicit paths only; a bare `git commit` sweeps
  unrelated staged files).

CHECKS — run ALL of these before marking a module DONE (current baseline is
fully clean: tsc 0 errors, eslint 0 problems, build passes):
1. npx tsc --noEmit                 -> must be 0 errors
2. npm run lint                     -> must be 0 problems
3. npm run build                    -> must succeed with no type errors
   (safe alongside `next dev`: Next 16 keeps dev output in .next/dev).
   If the build fails on something outside your module, report it, don't
   silently "fix" unrelated code.
4. Browser verification at 1440×900 AND 375×812 (mobile emulation) for every
   finding you fixed: reproduce the original evidence, then show it's gone
   (measure with DOM/computed styles, don't eyeball). Check the browser
   console and dev-server log for new errors/hydration warnings.
5. Regression sweep of the screens your module touched: open each one at both
   widths, confirm no horizontal page scroll (scrollWidth <= clientWidth) and
   no new console errors.
6. If you changed server code: also run `npm run test:subscription-payments`
   when local Postgres binaries (initdb/pg_ctl/psql) are available; if not,
   say so explicitly.

REPORTING — update .agents/ui-review/FIX-STATUS.md (only your module's
section) with, per finding ID: status (fixed / not reproducible / deferred +
reason / needs owner decision), files changed, and the verification evidence.
Then reply with: findings fixed, findings deferred and why, check results
(tsc/lint/build counts), and any owner decisions needed. If a finding needs a
product decision (listed per module), do NOT guess — implement the
recommended default only if the module says so, otherwise record it as
"needs owner decision".
```

---

## M0 — Data correctness: Dashboard + Outlet detail (BLOCKERS) · D-01, D-02, D-03, D-48

```text
MODULE M0 — numbers on screen are wrong. Fix root causes, not display.

Findings: D-01 (P0), D-48 (P0), D-02 (P1), D-03 (P1).

D-01 — Dashboard "All outlets" totals omit the HSR Layout outlet
(₹1,701/3 orders shown vs ₹1,761/4 true; EL-4 missing from Recent orders).
Lead (verify it): src/app/(workspace)/page.tsx ~L25-45. When
selection.allOutletsSelected is true, selection.outletId still carries the
DEFAULT outlet (see resolveOutletSelection in src/server/auth/session.ts),
and the page passes `{ outletId: selection.outletId }` to listOrders /
listExpenses, so "All outlets" is silently one outlet. Expected: when all
outlets are selected, query the whole store (outletId undefined) so org-wide
(outletId null) orders are included too. Check the per-outlet cards and the
"Recent orders — all outlets" list use the same source.
Also confirm the outlet switcher's "All outlets" state and the cookie
(el_selected_outlet) agree with what the page queries.

D-48 — Outlet detail (/admin/outlets/[outletId]) shows ₹0 / 0 orders /
"No recent order data" while the Dashboard shows sales for that outlet today.
Start at getOutletDetailForAdmin (src/server/services/outlets.ts) and
OutletDetail.tsx. Determine whether it reads DailyOutletSummary rollups
(B6) that are empty/not updated, uses a wrong date (UTC vs IST — use
todayIST()/parseCalendarDate from src/server/dates.ts), or renders
placeholders. Fix the root cause. If rollups are missing for existing
orders, do NOT run reconcile against the DB without asking the user; prefer
computing from orders the same way the Dashboard does, or report the
reconcile need as an owner decision.

D-02 — "Pending" KPI (1) vs outlet card "Pending" (2) count different things.
Recommended default (implement): one definition = orders not yet Delivered;
label it "Open orders" in both places.

D-03 — "Earnings vs expenses — this month" ₹658 < today's sales ₹1,701 and ≠
Sales "Collected" ₹1,537. Find what dashboardData() (admin.analytics.ts)
counts (collected payments vs billed order value, date basis, which
outlets). Recommended default: label precisely ("Collected this month" vs
"Billed this month") and make the same period show the same number as the
Sales screen for the same metric. If the numbers are intentionally
different metrics, rename + add a one-line help text; don't change the
accounting basis without an owner decision.

Owner decision to record (don't guess): whether org-wide orders (outletId
null) should count in per-outlet cards.

Verification must include arithmetic: KPI totals == sum of outlet cards;
Recent orders contains EL-4 under All outlets; outlet detail for
Chinnapnahalli and HSR matches the Dashboard's per-outlet figures today.
Add a short note under "Correction" in .agents/CURRENT-STATE.md's W2 section
describing the corrected behaviour (factual, no status/commit info).
```

---

## M1 — Order details (panel + dialog + invoice PDF) · D-31–D-36, M-09

```text
MODULE M1 — order details must be one consistent experience.

Files (start with graft): OrderDetails.tsx, OrderDetailsHeader.tsx,
OrderPaymentSummary.tsx (Bill/Invoice card), OrderDeliveryDetails.tsx,
OrderTable.tsx (OrdersClient opens OrderDetails asDialog), the Panel usage
in AdminScreenContainer.tsx, src/features/admin/pdf/OrderInvoicePdf.tsx,
CSS in src/app/(workspace)/admin/admin.css + tables.css.

D-31 (P1) — From Sales/Dashboard it's a side Panel WITH OrderDetailsHeader
(customer, phone, delivery, total); from Orders it's a centred Dialog with
NO customer/phone/outlet. Make both entry points render the same content,
including OrderDetailsHeader and the outlet name. Prefer one presentation
(the side panel) for both; if you keep the dialog, it must show identical
content. Keep invoice gating unchanged: Invoice card + invoice actions ONLY
when paid in full AND Delivered (server gate in order-invoices.ts).
D-32 (P2) — stepper: completed steps must look completed (filled
indicator/check), current step emphasised, future steps muted.
D-33 (P2) — every line item appears twice (Items table + Bill lines).
Keep the itemised breakdown in ONE place (recommended: the Bill/Invoice
card; the main column keeps work info). Don't lose qty × rate info.
D-34 (P3) — fix the grammar ("1 services" -> "1 service"), heading-size
inversion, and confusing colour coding called out in the finding.
D-35 (P3) — initial focus must not land on the tel: link; focus the panel
heading or close button.
D-36 (P3) — Record payment: add a "Pay balance" button that fills the
remaining balance (mirror New sale's "Paid in full"); keep server
validation as is. The form must still reset after a successful payment.
M-09 (P2) — invoice PDF prints "- · 7702961863" when the store address is
empty. Only render separators between present values (same fix in the
Super Admin InvoicePdf is OUT OF SCOPE — frozen).

Check at both widths: open EL-3 (part/fully paid, not delivered -> Bill),
EL-4 (paid + delivered -> Invoice) from Sales AND Orders AND Dashboard;
content must match across entry points. Keyboard: Tab order, Escape closes
(verify manually with a real key press; automation Escape may be flaky —
note which you used). View PDF for EL-4 returns 200 and the text has no
stray "-".
```

---

## M2 — Sales screen + New sale panel + payment methods · D-22–D-30, D-24, M-05 (Sales row), M-06

```text
MODULE M2 — counter speed and correctness.

Files: Sales.tsx, OrderEditorContainer.tsx (New sale),
AdminScreenContainer.tsx (sales branch only), OrderTable.tsx (row
semantics), src/app/(workspace)/admin/sales/page.tsx,
src/server/services/payment-methods.ts + platform-payment-methods.ts,
src/server/services/orders.ts (payment method resolution),
owner-workspace.css (/* new-sale form */ block), tables.css.

D-24 (P1) — Profile shows 4 enabled organisation payment methods (COD,
Card, Cash, Upi) but New sale and Record payment offer only Cash/UPI
(legacy StorePaymentMethod list). FIRST find what the server accepts for
an outlet-owned order (graft ask "resolveActivePaymentMethod"; CURRENT-STATE
B4 says outlet orders need an owner-enabled PlatformPaymentMethod). The UI
lists on New sale, Record payment (OrderPaymentSummary) and the employee
counter (EmployeeSalesContainer/OrderCart) must equal exactly the set the
server will accept. Do not loosen server validation. Record which source you
chose and why in FIX-STATUS.md.
D-23 (P1) — "Paid in full" must stay in sync: once pressed, Received now
tracks the subtotal as lines change until the user edits the amount
manually; show a pressed/active state. Balance must never silently appear.
D-22 (P1) — Sales register and Orders table rows must be keyboard
operable: a real <button> or <a> per row (or row with a focusable primary
cell), visible focus, Enter opens details, exposed in the a11y tree. Match
the Dashboard recent-orders pattern.
D-25 (P2) + M-06 (P3) — phone: validate 10-digit Indian mobile inline with
a styled error under the field (not only the native bubble), inputmode=tel.
D-26 (P2) — remove the duplicated "Outlet" heading+label (one label), menu
width >= trigger width, service picking fast (type-to-filter in the shared
dropdown if it supports it; otherwise note deferred), consistent controls.
D-27 (P2) — register: add Payment column (badge) since there's a payment
filter; add Outlet column when the store has >1 outlet.
D-28/D-29/D-30 (P3) — record only; they're fixed centrally in M9 (period
control, toolbar alignment, KPI tile component). Don't fork new versions.
M-05 (Sales row) — pill row overflow: add horizontal scroll with a fade
edge or wrap; no clipped labels.
Known issue to fix here too: opening/closing a service dropdown in New sale
without choosing triggers "Discard changes?" (data-dirty on the dropdown
wrapper). Only real value changes should mark the form dirty.
Known issue: after Save, the order panel is blank ~3s while router.refresh()
runs — show the saved order immediately (use the Order returned by
createOrderAction) or a skeleton, never an empty panel.

Check: create ONE new "QA …" order at 375px and at 1440px (multi-outlet
owner must choose outlet), confirm payment method choices == server-accepted
set, Paid in full stays synced after changing qty, keyboard-open a register
row with Tab+Enter.
```

---

## M3 — Orders screen + navigation · D-37–D-41, D-12, M-07, M-08, M-05 (Orders row)

```text
MODULE M3 — Orders list must be usable and truthful on both widths.

Files: OrderTable.tsx (OrdersClient), src/app/(workspace)/admin/orders/page.tsx,
AdminChrome.tsx (nav), tables.css, owner-workspace.css, globals.css /
admin.css (for M-07's overflow-wrap rule — find it with
graft grep "overflow-wrap").

D-37 (P1) — outlet filter set to one outlet still shows org-wide EL-1 and
subtitle stays "across all outlets". Filter strictly by selected outlets;
if org-wide orders should be reachable, add an explicit "Organization-wide"
option. Subtitle reflects the active filter.
D-38 (P1) — reversed date range: prevent it (min/max linking) or show an
inline error; the empty state for "no matches" must say so and offer
"Clear filters" (never the first-use "Get started…" copy). Add a Clear
filters control.
D-39 (P2) — multi-select trigger text and checkbox state must agree;
"Clear" applies immediately (or Apply is obviously required) — use the
shared MultiSelectDropdown behaviour consistently with Sales.
D-40 (P2) — accessible names on date inputs and search.
D-41 (P3) — remove the double inset so rows aren't cramped at 1024.
D-12 (P1) — /admin/orders is reachable ("View all →") but not in the
sidebar and no nav item is active. Owner decision: keep Orders as its own
nav item or merge into Sales. Recommended default (implement): add
"Orders" to the owner sidebar with active state, matching existing items
(icon from the same Icon set), and keep employee nav unchanged
(employees already have Sales/Orders per admin.permissions.ts).
M-07 (P1) — mobile list breaks names mid-word ("AppTea/m"): find the global
`overflow-wrap:anywhere` rule leaking into the workspace (legacy
globals.css) and scope the fix to the workspace — do NOT change Super Admin
rendering (.soa already overrides it; verify Super Admin pages are
pixel-identical before/after).
M-08 (P1) — mobile Orders is capped at "Latest 5 … page-numbered on
desktop" with no search/filters. Mobile must have search + filters (can be
a collapsible filter sheet) and pagination or load-more. Remove the
developer copy.
M-05 (Orders pills) — no clipped "In prog…"; scrollable with affordance or
wrap.

Check: 375px — search finds EL-1 by phone, older orders reachable, no
mid-word breaks; 1440px — filter one outlet excludes org-wide unless chosen,
reversed dates handled, Clear works; Orders nav item active.
```

---

## M4 — Products / service catalogue · D-16 (Products), D-17–D-21, M-10

```text
MODULE M4 — Products screen and service editor.

Files: Catalogue.tsx, ProductEditorContainer.tsx (under
src/features/admin/containers — NOT the stray copy in scratch/, which is
excluded from tsc/eslint and must be left alone), related CSS.

D-16 (P1, Products part) — every visible label must be programmatically
associated (<label htmlFor> / wrapping label / aria-labelledby); the Active
switch needs an accessible name. Match how Profile's Edit dialog does it.
(Expenses/Employees parts are in M5/M6; if you build a shared Field
helper, keep it tiny and reuse it there — check graft callers first.)
D-17 (P2) — slab editor: placeholders must not look like data (muted,
"e.g."), add column headers with units (Up to kg / Price ₹), sensible
input widths.
D-18 (P2) — banner/card gap; info banner must not reuse the error-banner
class (same issue on Outlets — fix both with one shared info style).
D-19 (P3) — count shows "N of M" while searching; empty search state offers
"Clear search".
D-20 (P3) — naming: pick one noun. Recommended default: keep nav
"Products", card title "Services & pricing", button "Add service"; or
record as owner decision if you think it needs product input.
D-21 (P3) — dialog close button size consistent with other icon buttons;
initial focus goes to the first field, not the close button.
M-10 (P2) — remove the raw UUID from catalogue cards (keep it only where
genuinely needed, e.g. nowhere visible to owners).

Check both widths; open Add service (item + weight), edit QA Shirt Press,
Cancel without saving; verify screen-reader names via the a11y tree.
```

---

## M5 — Expenses · D-42, D-43, D-16 (Expenses part)

```text
MODULE M5 — Expenses screen and Add expense editor.

Files: Expenses.tsx, ExpenseEditor.tsx, AdminScreenContainer.tsx (expenses
branch only), CSS.

D-42 (P2) — duplicated page title + CTA; subtitle describes a layout that
doesn't exist. One heading, one primary CTA, accurate subtitle.
D-43 (P3) — outlet filter pills styled like Sales chips (shared style);
"Applies to" dropdown full width in the dialog.
D-16 (Expenses part) — label association in Add expense.
Also verify the empty state (store has zero expenses) is helpful and that
the mark-paid confirmation copy is correct by reading code (don't mark
anything paid on real data; you may create one "QA expense" to test the
flow end to end, then mark it paid).

Check both widths.
```

---

## M6 — Employees · D-44–D-47, D-16 (Employees part)

```text
MODULE M6 — Employees list and Add/Edit employee.

Files: Employees.tsx, EmployeeEditor.tsx, AdminScreenContainer.tsx
(employee handlers only), CSS.

D-44 (P1) — an active employee with zero outlets can't work anywhere and
isn't flagged; the summary line contradicts the table. Show a warning
badge/row note "No outlet assigned — can't sign in to any outlet" with a
direct action to open the Outlets disclosure; make the summary line match.
D-45 (P2) — separate the destructive action (Deactivate) from Edit
(spacing/menu/secondary-danger styling) and make the Edit label match the
dialog title.
D-46 (P2) — password field: type=password with a show/hide toggle
(keep autocomplete="new-password", minLength 8, required only when
creating — this was just fixed; don't regress: editing with an empty
password must leave the password unchanged); labels associated (D-16);
one dropdown type (shared component); dialog not oversized.
D-47 (P3) — duplicated title.
Known open items you may fix if trivial, else record: Cancel after typing
should ask "Discard changes?" (use the Panel warnOnChanges pattern used by
other editors); the phone field value is currently not persisted on save
(owner chose to leave it earlier — record as needs owner decision, don't
change server).

Check: open Add employee, type, Cancel -> discard prompt; open Edit on a
real employee and Cancel WITHOUT saving. Do not deactivate anyone.
```

---

## M7 — Outlets (list + detail) · D-49, M-11 (D-48 is fixed in M0)

```text
MODULE M7 — Outlets list and detail polish. Run after M0.

Files: OutletsList.tsx, OutletDetail.tsx, CSS.

D-49 (P3) — oversized hit area, developer wording in subtitles, uneven
tiles at 1024. The "14d ▾" Pill on OutletDetail (OutletDetail.tsx ~L97)
must be a real control or removed — no fake dropdown affordance.
M-11 (P3) — "← Back to outlets" tap target >= 44px tall.
Re-verify D-48 numbers still match the Dashboard after M0.

Check both widths.
```

---

## M8 — Profile + payment method settings · D-50, D-51, D-52

```text
MODULE M8 — Profile screen.

Files: Profile.tsx, PaymentMethodsSettings.tsx, AdminScreenContainer.tsx
(profile branch only), CSS.

D-50 (P2) — toggling a payment method instantly changes checkout at every
outlet with no confirmation/undo; switches are small; labels read as
commands. Add a confirmation (or an undo toast) for disabling, >= 44px
touch targets, labels as states ("Cash · Enabled"). Must stay consistent
with M2's decision about which methods checkout uses.
D-51 (P3) — even vertical rhythm in the right column; the Edit dialog must
not edit fields the page never shows (show them, or remove from the dialog).
D-52 (P3) — change password: inline guidance (min 8, must differ), and
typed input triggers the standard discard prompt on close.

Never submit the change-password form with real values. Validation can be
tested with obviously wrong input only if the server rejects it; prefer
testing client-side validation without submitting.
```

---

## M9 — App chrome + design-system consistency (cross-cutting, run LAST) · D-04–D-11, D-13–D-15, D-28–D-30, M-01–M-04, M-05 (Expenses row)

```text
MODULE M9 — make the workspace feel like one product. Run after M0–M8 so
you consolidate what they left, not fight them.

Files: AdminChrome.tsx, Primitives.tsx, components/ui/*, Dashboard.tsx,
DashboardCharts.tsx, DashboardOutletControl.tsx, admin.css,
owner-workspace.css, dashboard.css, tables.css, pos.css. Tokens live in
src/app/app.css (@theme). Tailwind utilities are intentionally DISABLED
(see the NOTE in app.css and .agents/css-refactor/STATUS.md finding F2) —
do not enable them in this module.

Dashboard controls:
D-04 (P2) — range popover closes on Escape/outside click, one control not
three, select and pill agree.
D-05 (P2) — "14 days" chart: label axes readably (daily buckets, enough x
labels, or say "2-day buckets").
D-06 (P2) — chart points: not 7 invisible tab stops — either visible focus
+ tooltip, or remove them from tab order and provide a text summary.
D-07 (P3) — outlet summary grid fills width; section title matches card
titles.
D-08 (P2) — "Needs attention" rows: make them links to the filtered list
or style them as non-interactive.
M-01 (P2) — date inputs in the range popover wide enough (no clipped year).
M-02 (P3) — recent-orders table on mobile: card layout or visible scroll
affordance.

Global:
D-09 (P3) — one page-title (h1) size across all screens.
D-10 (P2) — sidebar footer copy/brand text legible and current.
D-11 (P2) — no "↗" on in-page actions (e.g. "Save order ↗"); the two logout
controls use the same label/icon.
D-13 (P3) — one button system (converge the two classes; check
graft callers for each before changing).
D-14 (P3) — overlay patterns: consistent title size, close button, footer
across Panel / Dialog / ConfirmationDialog.
D-15 (P3) — styled inline field errors available as a shared pattern
(M2/M4/M8 may already use it — reuse, don't duplicate).
D-28/D-29/D-30 (P3) — one period control, one date format, aligned filter
toolbar heights, one KPI tile component.
M-03 (P2) — touch targets >= 44×44 on mobile: hamburger, avatar, drawer
rows, switches, back links, dialog buttons, checkbox rows.
M-04 (P2) — dropdowns: owner-facing selects use the shared dropdown
components consistently (Products category/charging type, payment method,
outlet pickers). Native <input type=date> may stay. Custom popovers on
mobile need a proper scrim/sheet or must be clearly anchored.
M-05 (Expenses pills) — same overflow treatment as M2/M3.

This module touches shared CSS: after changes, open EVERY owner screen and
the Super Admin dashboard + stores list at 1440 and 375 and confirm Super
Admin is visually unchanged (compare screenshots before/after).
```

---

## FIX-STATUS.md template (create in M0 if missing)

```markdown
# UI review fix status

| Module | Findings | Status | Checks (tsc / lint / build / browser) |
|---|---|---|---|
| M0 Data correctness | D-01 D-02 D-03 D-48 | TODO | |
| M1 Order details | D-31–D-36 M-09 | TODO | |
| M2 Sales + New sale | D-22–D-30 M-05 M-06 | TODO | |
| M3 Orders + nav | D-12 D-37–D-41 M-05 M-07 M-08 | TODO | |
| M4 Products | D-16 D-17–D-21 M-10 | TODO | |
| M5 Expenses | D-16 D-42 D-43 | TODO | |
| M6 Employees | D-16 D-44–D-47 | TODO | |
| M7 Outlets | D-49 M-11 | TODO | |
| M8 Profile | D-50–D-52 | TODO | |
| M9 Chrome + design system | D-04–D-11 D-13–D-15 D-28–D-30 M-01–M-05 | TODO | |

## Per-module detail
(one section per module: finding → status → files → evidence; owner decisions)
```
