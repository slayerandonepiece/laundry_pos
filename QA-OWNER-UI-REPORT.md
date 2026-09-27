# Owner workspace QA report

Latest follow-up: the 13 order-detail, expense, employee and navigation comments are implemented. See [27 September feedback report](QA-OWNER-FEEDBACK-REPORT.md) for current verification and limits. The original audit below is retained as history.

Date: 27 September 2026 (IST). Environment: existing authenticated owner session at http://localhost:3000, Next.js development server, current dirty working tree. Scope: loading feedback, skeletons, UI, responsive rendering and safe form exploration. No application fixes or business records were saved.

## QA decision

**Needs fixes before UI acceptance.** Skeletons exist and do render; the problem is inconsistent coverage, mismatched placeholders and missing action progress. This is an owner UI audit, not full application or transaction certification. Production performance was not measured.

## Coverage

| Area | Exercised | Result / limit |
|---|---|---|
| Dashboard | Overview, empty chart/orders, period dropdown, route loading | Loaded; dashboard skeleton observed |
| Products | Catalogue, search with no match, add dialog | Search distinguishes filtered empty; add dialog opens |
| Sales | Register, new sale panel, add service row, cancel/discard draft | Opens; discard confirmation works; no order submitted |
| Orders | Initial empty, search empty, clear controls, mobile status layout | Loaded; first-use state and mobile layout defects below |
| Expenses | Initial empty, add dialog, outlet picker UI | Loaded; skeleton observed; no expense submitted |
| Employees | Initial empty, add dialog, default-outlet disabled state | Loaded; no employee created |
| Outlets | Directory, View link, outlet detail | Read-only directory/detail loaded |
| Profile | Details, edit dialog/cancel, billing, payment methods | Loaded; profile skeleton observed; no settings changed |

Responsive sweeps covered all eight top-level modules at 1440px, 768px, 390px and 320px. Document scroll width equaled viewport width in checked settled states. Outlet detail was additionally inspected at 390px. Forms were inspected at 390px; this does not certify every dialog at every width. The account had four services, one outlet, zero employees and zero orders/expenses in the visible lists.

## Findings

### QA-01 — P1: service, expense and employee saves have no pending UI or submit lock

Evidence: **source-confirmed; server submission not exercised**. Dialog submit buttons remain enabled with fixed labels. Their `onSave` contracts return `void`; the parent starts promises without exposing pending state. A slow request therefore has no visible acknowledgement or protection in these forms against repeated submission. Duplicate records are a risk, not a reproduced outcome.

Sources: `src/features/admin/containers/ProductEditorContainer.tsx:29–61`, `src/features/admin/components/ExpenseEditor.tsx:14–83`, `src/features/admin/components/EmployeeEditor.tsx:16–37,135–143`, and `src/features/admin/containers/AdminScreenContainer.tsx:112–132,182–186`.

Reproduce after remediation in a disposable test environment: submit a valid form with a delayed server response, immediately submit again, then inject failure. Expect one request, disabled submit, visible Saving…/spinner, preserved input on failure and an enabled retry. Closing while pending must have a defined behavior.

### QA-02 — P2: order saving has an invisible pending state

Evidence: **source-confirmed**. `OrderEditorContainer` uses `submitted.current` and an idempotency key, which is useful duplicate protection. However, neither updates rendered pending state. Save order stays visually enabled and keeps its label during the request; its disabled condition only checks availability of services. See `src/features/admin/containers/OrderEditorContainer.tsx:22–25,38–61,86`.

Expected: render a pending state, disable submit and conflicting edits, announce Saving order…, restore retry on failure. Retain the existing idempotency guard. No duplicate-order claim is made.

### QA-03 — P2: hard loading replaces the whole workspace with a generic spinner

Evidence: **browser-confirmed** on direct Products loading, reproduced during a later hard load. A nearly blank page shows a centered spinner and Loading…; navigation and page-shaped content disappear before the workspace skeleton/content arrives. Screenshot: [hard-load.png](qa-evidence/hard-load.png).

Source: `src/app/loading.tsx:1–6`. The route-specific skeletons are present, but cannot cover every earlier loading boundary.

Expected: retain meaningful workspace structure where possible and provide an intentional shell fallback before auth/layout resolution. Avoid treating the existence of a nested `loading.tsx` as proof of complete loading coverage.

### QA-04 — P2: client readiness has text-only fallbacks outside Dashboard

Evidence: **source-confirmed; transient client stage not isolated in the browser**. `AdminScreenContainer.tsx:76–80` renders DashboardLoading only for Dashboard; other screens use Opening your workspace… while provider readiness resolves. `AdminProvider.tsx:24–65` initializes readiness false and reconciles session status.

Expected: appropriate skeletons for non-dashboard client initialization, preserving authentication correctness. Test an existing cookie session in a fresh tab and delayed session reconciliation. Do not display a first-use empty state while data is still pending.

### QA-05 — P2: generic table skeletons do not match final responsive layouts

Evidence: **browser + source-confirmed**. Expenses loading at 390px showed table-like rows and a search placeholder; the final state had a date control, outlet pills and an empty-state card. Mobile Orders use cards/status controls but their route fallback is `TableLoading hasStats cols={5}`. Products, Employees and Outlets also reuse a desktop-like table placeholder. Outlet-detail fallback has three snapshot tiles while its final snapshot has four.

Sources: `src/features/admin/components/WorkspaceLoading.tsx:4–81,130–171`; module `loading.tsx` files under `src/app/(workspace)/admin/`.

Expected: skeletons share the real screen's responsive structure, control placement and row/card dimensions. No measured CLS score is claimed. Validate loading-to-content transitions at all four widths.

### QA-06 — P2: Orders first-use empty state gives instructions without an action

Evidence: **browser-confirmed**, desktop and mobile. With no filters: Nothing here yet / Get started by creating your first entry. There is no create-order CTA in this state. Entering a search correctly changes to No matching orders and exposes Clear filters.

Expected: No orders yet, order-specific copy, and Create an order linking to Sales. The requirements' shared empty-state pattern calls for screen-specific text and a primary action. See [orders-mobile.png](qa-evidence/orders-mobile.png).

### QA-07 — P2: mobile Orders status controls wrap instead of scrolling horizontally

Evidence: **browser-confirmed** at 390px and 320px. All status/Pending/In progress/Ready/Delivered wrap to multiple lines. The owner requirements specify a horizontally scrollable status pill row.

Expected: one horizontal row with accessible scrolling and a clearly visible selected status; keep search/date controls usable. See [orders-mobile.png](qa-evidence/orders-mobile.png).

### QA-08 — P2: Products search field spills outside its card on small mobile

Evidence: **browser-confirmed** at 320px. The fixed-width service search field extends past the enclosing card's right edge. DOM measurement: input left 36px, width 280px, right 316px. There is no document-level overflow, so a page-width-only assertion misses this issue.

Expected: constrain the input to its available parent width and inspect component containment, not only document scroll width. See [products-small-mobile.png](qa-evidence/products-small-mobile.png).

### QA-09 — P1: expense outlet selection is dropped by the parent save handler

Evidence: **source-confirmed; no saved expense used to reproduce**. ExpenseEditor includes the chosen `outletId` in its `onSave` value (`ExpenseEditor.tsx:71–83`). `AdminScreenContainer.tsx:112–117` calls `createExpenseAction` with title/category/amount/due/monthly/paidToday but omits outletId. The UI therefore offers outlet selection without forwarding it through this handler.

Expected: propagate the selected outlet and verify the saved expense's scope and dashboard allocation using disposable data. This is a data-flow defect discovered during the UI audit; persisted behavior has not been certified.

### QA-10 — P3: development console reports smooth-scroll route-transition warning

Evidence: **browser-confirmed**. Captured warning: scroll-behavior: smooth on html requires `data-scroll-behavior="smooth"` for Next.js route-transition handling. No browser error-level entries were returned by the final sampled log query. This is not a claim that all paths are error-free.

Expected: review the installed Next.js guidance and verify route scroll restoration after correction.

## Positive checks

- Session remained authenticated across navigation and hard loading.
- Route skeletons are real: Orders, Expenses, Profile and Dashboard loading states were observed. Existing loaders expose status/busy semantics in the inspected source.
- Product search and Orders search distinguish filtered emptiness.
- Mobile navigation opens and closes on route selection; keyboard activation works.
- New-sale unsaved-change confirmation appeared and the QA draft was discarded.
- Expense and employee forms fit the inspected 390px viewport. Employee default outlet starts disabled until outlets are selected.
- Profile edit opens and cancels; outlets remain read-only.
- No page-level horizontal overflow was measured in the responsive sweeps.

## Remaining verification required

Full completion is blocked by coverage/data limitations, not by a failing build: no existing order rows were available for order detail, invoice/PDF, payment/status changes, populated pagination or infinite-scroll checks; there were no employee rows for management/reactivation checks. Multi-outlet switching requires a multi-outlet account. Slow-network/offline/server-error injection, retry with stale rows, action success/failure/duplicate behavior and screen-reader/reduced-motion testing remain unverified. Production loading timings were not tested. No purchase, payment, credential change, deletion, session logout or business-data write was performed.

No lint/build/test gate was run for this report-only change; these would not establish browser loading quality. Existing unrelated working-tree changes were preserved. Stored full-page screenshots have capture/stitching artifacts in some sizes; use the viewport evidence above for the listed visual defects and reproduce before implementation.

## Acceptance checklist for the fix pass

1. Every slow form action visibly enters pending state, prevents repeated submissions and recovers with inline errors/retry.
2. Hard-load, route-load and client-readiness stages all have intentional accessible feedback.
3. Mobile skeletons match cards; desktop skeletons match table rows and control positions.
4. First-use and filtered-empty states use correct copy and reachable actions.
5. All modules and dialogs pass containment checks at 1440/768/390/320px; Orders pills scroll horizontally.
6. Selected expense scope reaches the save action and persists correctly in disposable-data tests.
7. Re-test populated lists, multi-outlet, error recovery and order/PDF workflows before full QA sign-off.


## Annotated browser comments — implementation and retest (2026-09-27)

All 15 comments have corresponding implementation changes. Earlier findings above remain historical evidence, not a claim that every finding is still open.

| Comment | Result | Evidence / limits |
| --- | --- | --- |
| 1 | Search button and Enter call the existing store-scoped phone lookup; validation, pending, existing/new and error states | Live invalid-phone and new-customer lookup passed; no order saved. Existing lookup service retained. |
| 2 | Explain no enabled methods and link to Profile; unpaid sale remains possible | Live form shows explicit disabled option. The organization has no enabled checkout methods; none were silently enabled. |
| 3 | Payment method precedes Received now; COD hides received input and sends no immediate payment | Source reviewed; stable COD code/name handling unit test passes. Live COD selection was not tested because this organization has no enabled methods. |
| 4–5 | Sales date input clicks request native picker through shared DateInput | Source verified; automation pointer delivery did not reliably focus inputs, so native popup opening requires manual retest. |
| 6 | Single owner-workspace focus outline; Dialog initial focus stays stable across rerenders | Desktop/mobile expense screenshots show a single ring; shared field rules cover owner forms. |
| 7–8 | Orders dates use normal input layout, not flex-column field wrappers; shared picker handler | Source verified; date alignment visually checked. Native picker pointer retest limitation above applies. |
| 9 | Expense monthly/paid options form a two-column row | Desktop and 390px screenshots passed; labels wrap on narrow screens. |
| 10 | Mark-paid dialog contains paid date defaulting to today, max today, saving/error states | Live dialog inspected and cancelled. Disposable database test proves selected date, exact rollup day, invalid/future rejection and repeat-call preservation. |
| 11 | Employee outlets update immediately; Clear top-right; no Apply | Live checked selection updates tag and default outlet immediately. |
| 12 | Default outlet disabled with no selections; enabled after selection | Live checked both states. |
| 13–14 | Employee footer is Dialog foot; form no longer adds nested body padding | Live desktop dialog checked and screenshot saved; title/body/footer separate. |
| 15 | Outlet trend opens DashboardPeriodControl and changes separate chart range | Live Last 14 days menu opened; This month selection changed control/title and closed menu. No nonzero chart data in current account to compare bars. |

Validation: `npx tsc --noEmit` passed; `npm run lint` passed with only the two pre-existing unused-catch warnings in `scripts/qa_audit.mjs`; all 75 isolated PostgreSQL integration tests passed; COD method test passed. Tests use disposable local PostgreSQL, not Neon. No packages/schema changes, commits, deployment, real bill payments, new employees or sales.

Evidence: [sale search](qa-evidence/sale-search-fixed.png), [employee dialog](qa-evidence/employee-dialog-fixed.png), [paid date](qa-evidence/expense-paid-date-fixed.png), [desktop expense options](qa-evidence/expense-options-fixed.png), [390px expense options](qa-evidence/expense-options-mobile.png), [outlet period](qa-evidence/outlet-period-fixed.png).
