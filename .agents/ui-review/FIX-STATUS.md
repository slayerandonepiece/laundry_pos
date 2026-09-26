# UI review fix status

| Module | Findings | Status | Checks (tsc / lint / build / browser) |
|---|---|---|---|
| M0 Data correctness | D-01 D-02 D-03 D-48 | DONE (parent-verified) | tsc 0; lint 0; build passes; dashboard-metrics test passes; browser 1440 + 375 verified by parent |
| M1 Order details | D-31–D-36 M-09 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M2 Sales + New sale | D-22–D-30 M-05 M-06 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M3 Orders + nav | D-12 D-37–D-41 M-05 M-07 M-08 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M4 Products | D-16 D-17–D-21 M-10 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M5 Expenses | D-16 D-42 D-43 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M6 Employees | D-16 D-44–D-47 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M7 Outlets | D-49 M-11 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M8 Profile | D-50–D-52 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M9 Chrome + design system | D-04–D-11 D-13–D-15 D-28–D-30 M-01–M-05 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |

## Per-module detail

### M0 Data correctness: Dashboard + Outlet detail

- **D-01 (P0)**: Dashboard "All outlets" totals omit the HSR Layout outlet
  - Status: FIXED
  - Files: `src/app/(workspace)/page.tsx`
  - Evidence: When `allOutletsSelected` is true, `targetOutletId` is `undefined`, querying `listOrders` and `listExpenses` without outlet restriction. Today's sales KPI correctly aggregates ₹1,761 across 4 orders (Chinnapanahalli ₹1,701/3 orders + HSR ₹60/1 order). Recent orders table includes order EL-4 (HSR Layout, ₹60).

- **D-48 (P0)**: Outlet detail (/admin/outlets/[outletId]) shows ₹0 / 0 orders / "No recent order data"
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/outlets/[outletId]/page.tsx`, `src/features/admin/components/OutletDetail.tsx`
  - Evidence: Server page now fetches `listOrders`, `listExpenses`, `listProducts`, and `listEmployees` for the specific outlet. `OutletDetail.tsx` computes live metrics using `dashboardData`: Today's snapshot (Today's sales, Orders today, Open orders, Items sold today), Collected vs expenses donut chart, Sales trend line chart with `SalesChart`, active employees table, and dynamic Order status breakdown donut. Live figures for Chinnapanahalli (₹1,701 / 3 orders) and HSR (₹60 / 1 order) match the Dashboard cards.

- **D-02 (P1)**: "Pending" KPI vs outlet card "Pending" count different things
  - Status: FIXED
  - Files: `src/features/admin/components/Dashboard.tsx`, `src/features/admin/components/OutletDetail.tsx`
  - Evidence: Standardized on "orders not yet Delivered" (`!isDelivered(order.status)`). Replaced "Pending" label with "Open orders" on the Dashboard KPI tile (`d.todo`), per-outlet summary cards (`openOrders = d.commitments.filter(o => o.outletId === outlet.id).length`), and Outlet detail snapshot. Arithmetic verified: KPI Open orders (2) == sum of outlet cards (Chinnapanahalli 2 + HSR 0 = 2).

- **D-03 (P1)**: "Earnings vs expenses — this month" vs today's sales and Sales "Collected"
  - Status: FIXED
  - Files: `src/features/admin/components/Dashboard.tsx`, `src/features/admin/components/DashboardCharts.tsx`
  - Evidence: Addressed discrepancy caused by D-01 omitting HSR and org-wide payments under All outlets. Clarified metric semantics: renamed card to "Collected vs expenses — this month", added explanatory subtitle "payments collected this month", and changed chart legend from "Earnings" to "Collected", distinguishing actual cash receipts from gross billed order values ("Today's sales").

#### Owner decisions recorded
- **Org-wide orders in per-outlet cards**: Org-wide orders (`outletId: null`, such as EL-1) count exclusively in "All outlets" aggregate totals and are not attributed to any specific physical outlet card.
- **Cash basis vs accrual basis collection**: Dashboard "Collected vs expenses — this month" continues to reflect actual cash collections received during the current calendar month (cash basis), labelled clearly as "Collected vs expenses" with explanatory subtitle "payments collected this month" to distinguish from gross order value ("Today's sales").

#### M0 parent verification (2026-09-22)
- Browser: Dashboard All outlets ₹1,761 / 4 orders = Chinnapnahalli ₹1,701 / 3 + HSR ₹60 / 1; EL-4 in Recent orders; Open orders 2 = 2 + 0; Collected this month ₹1,537 = Sales "Collected". Outlet details match per-outlet figures. No horizontal scroll at 375px.
- Parent follow-up fixes: OutletDetail "Items sold today" summed pcs + kg (26.922) → now "Pieces sold today" (pcs only, 18); DashboardCharts `<title>` children array logged a React server error on every chart render → single template string.
- `npm run build` passes (the agent's "skipped by user" was incorrect; no such instruction was given). `npm run test:subscription-payments` could not run in the agent's sandbox (Postgres shared memory) — not run.

### M1 Order details (2026-09-22)
- D-31 fixed: Orders opens the same side Panel as Sales/Dashboard with OrderDetailsHeader (customer, phone, outlet).
- D-32 fixed: stepper states completed (green ✓) / current (blue) / future (muted).
- D-33 fixed: duplicate Items table removed; items listed once in the Bill/Invoice card.
- D-34 fixed: "1 service"/"1 pc", 16px headings, green balance box when paid, Pending (work) and Unpaid (payment) badges no longer share amber. Side effect noted: Pending / In Progress / Ready now all share blue.
- D-35 fixed (parent): the details panel focuses its Close button after showModal (React autoFocus did not survive showModal; focus was still on the tel: link). Form panels unchanged.
- D-36 fixed: "Pay balance" fills the exact balance (EL-2 → 1043.00).
- M-09 fixed: invoice PDF only joins present address/phone parts (no stray "-").
- Parent follow-ups: outlet name was "Organization-wide" when opened from the Dashboard (outlets arrive as dashboardOutlets) — now resolved from both lists, "Organization-wide" only when order.outletId is empty, filler caption removed; weight lines no longer show a made-up per-kg rate; 375px header back to a 2×2 grid (193px, was 277px with "₹1,04/3" wrapping).
- Implemented by Antigravity; its `npm run build` hung in its sandbox (no build process ran on the host) — parent ran the build (passes in ~9s).

### M2 Sales + New sale (2026-09-22)
- **D-24 (P1)**: Profile shows 4 enabled organization payment methods (COD, Card, Cash, UPI), unified with New sale and Record payment.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/sales/page.tsx`, `src/app/(workspace)/admin/orders/page.tsx`
  - Evidence: Graft and CURRENT-STATE B4 confirmed `resolveActivePaymentMethod` strictly requires enabled `OrganizationPaymentMethod` for outlet orders (`allowLegacy: false`). Replaced legacy `listStorePaymentMethods` with `listOrganizationPaymentMethods`, mapping enabled methods (`pm.enabled`). Matches the exact set accepted by server validation for outlet orders without loosening validation.
- **D-23 (P1)**: "Paid in full" button stays in sync live as lines change.
  - Status: FIXED
  - Files: `src/features/admin/containers/OrderEditorContainer.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: `paidInFull` boolean state tracks active status (`aria-pressed`, `.ad-active` style). `effectiveReceived` derives synchronously from line items sum whenever `paidInFull` is true. Typing into Received manually clears `paidInFull`. Balance never silently reappears while in paid-in-full state.
- **D-22 (P1)**: Sales register and Orders table rows keyboard operable.
  - Status: FIXED
  - Files: `src/features/admin/components/OrderTable.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Order codes are wrapped in `<button type="button" className="dashboard-order-link" ...>` matching the Dashboard pattern. Rows and mobile cards include `onKeyDown` Enter handler and role="button" exposed in the a11y tree.
- **D-25 (P2) & M-06 (P3)**: Phone number validation & mobile inputmode.
  - Status: FIXED
  - Files: `src/features/admin/containers/OrderEditorContainer.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Added `type="tel"`, `inputMode="tel"`, `maxLength={10}`, `pattern="[0-9]{10}"`, 10-digit validation on change/blur/submit, and custom inline `<p className="ad-field-error" role="alert">` styled with red helper text.
- **D-26 (P2)**: New sale form hygiene and dropdown fixes.
  - Status: FIXED
  - Files: `src/features/admin/containers/OrderEditorContainer.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Removed duplicate `<h3>Outlet</h3>` (retained clean `<span>Outlet</span>` label). Dropdown menu min-width styled to `max(100%, min(230px, calc(100vw - 32px)))` so menu width is >= trigger width. Removed `data-dirty` from dropdown container wrappers so opening/closing without selecting does not trigger "Discard changes?". Added service unit prices to dropdown labels (`${item.name} (${priceText})`). Reserved payment method selector layout space (`disabled={shownReceived <= 0}`) to prevent layout shifts.
- **D-27 (P2)**: Register Payment column and conditional Outlet column.
  - Status: FIXED
  - Files: `src/features/admin/components/OrderTable.tsx`, `src/features/admin/components/Sales.tsx`, `src/features/admin/containers/AdminScreenContainer.tsx`
  - Evidence: Added Payment column badge (`UIBadge`) to desktop table and mobile cards. Added Outlet column conditioned on `outlets && outlets.length > 1`. Passed `outlets` through `Sales.tsx` and `AdminScreenContainer.tsx`.
- **D-28, D-29, D-30 (P3)**: Period control, toolbar alignment, KPI tile component.
  - Status: DEFERRED TO M9 per instructions.
- **M-05 (Sales row)**: Pill row overflow on mobile.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/tables.css`
  - Evidence: Added `display: flex; flex-wrap: wrap; gap: 6px; max-width: 100%` on `.ad-category-tabs` preventing label clipping and unintended horizontal bleed.
- **M2 Known Issues**:
  - Empty panel ~3s after Save: in `AdminScreenContainer.tsx`, added `optimisticOrders` state merged with `serverOrders` via `useMemo` so when `createOrderAction` returns, the details panel opens immediately without delay.

### M3 Orders + navigation (2026-09-22)
- **D-12 (P1)**: Orders added to owner sidebar navigation with active indicator.
  - Status: FIXED
  - Files: `src/features/admin/components/AdminChrome.tsx`
  - Evidence: Updated navigation filter in `AdminChrome.tsx` to include `orders` for owner (`role === 'owner' || ['sales', 'orders'].includes(id)`). Nav link displays "Orders" with history icon, sets `aria-current="page"` and `.active` class when browsing `/admin/orders`.
- **D-37 (P1)**: Outlet multi-select filter strictly excludes org-wide orders unless chosen; subtitle reflects active filter.
  - Status: FIXED
  - Files: `src/features/admin/components/OrderTable.tsx`
  - Evidence: Outlet options now explicitly provide individual physical outlets plus an explicit `Organization-wide` option. Filtering to Chinnapanahalli strictly includes Chinnapanahalli orders and excludes org-wide order EL-1. Subtitle dynamically reports active selection (`Showing 4 orders for Chinnapnahalli`, `Showing 5 orders across all outlets`, `Showing 1 order for Organization-wide`) and removes developer copy "page-numbered on desktop".
- **D-38 (P1)**: Date range constraints, empty state handling, and Clear filters control.
  - Status: FIXED
  - Files: `src/features/admin/components/OrderTable.tsx`
  - Evidence: Added `max={dateTo}` on From date and `min={dateFrom}` on To date. Reversed date ranges immediately render empty list with `EmptyState` (`isFiltered={true}`) displaying "No matching orders" and "Clear filters" action button instead of first-use copy. Added toolbar "Clear filters" button whenever any filter is active.
- **D-39 (P2)**: MultiSelectDropdown state agreement and immediate Clear.
  - Status: FIXED
  - Files: `src/features/admin/components/ui/Dropdown.tsx`, `src/features/admin/components/OrderTable.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: `selectedOutlets` initializes with all outlet values, ensuring all checkboxes (including "All outlets") are checked when opening the dropdown. `handleClear` in `Dropdown.tsx` immediately calls `onChange([])` and closes the dropdown. Constrained dropdown wrapper max-width to 220px in toolbar to prevent shifting adjacent inputs.
- **D-40 (P2)**: Accessible names on date inputs and search.
  - Status: FIXED
  - Files: `src/features/admin/components/OrderTable.tsx`
  - Evidence: Added visible `<label>` wrappers with "From" and "To" text and `aria-label="From date"`, `aria-label="To date"`. Added `aria-label="Search orders by customer, phone or order code"` to the search input.
- **D-41 (P3)**: Layout double-inset elimination & date wrap.
  - Status: FIXED
  - Files: `src/features/admin/components/OrderTable.tsx`
  - Evidence: Removed extra `padding: 26px 30px` from `OrdersClient` container so card aligns with standard workspace layout at x=272. Added `white-space: nowrap` on date cells in the desktop table.
- **M-07 (P1)**: Scoped overflow-wrap to workspace to fix mid-word text wrapping ("AppTea/m").
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/admin.css`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Replaced `.ad-root h1, ... { overflow-wrap: anywhere }` in `admin.css` with `overflow-wrap: normal; word-break: normal`. Scoped normal wrapping in `owner-workspace.css`. In `OrderTable.tsx`, added `minWidth: 0` and flex spacing to customer name and outlet name. Super Admin routes (`.soa`) remain untouched and pixel-identical.
- **M-08 (P1) & M-05 (Orders pills)**: Mobile Orders search, filters, pagination, and pill wrap.
  - Status: FIXED
  - Files: `src/features/admin/components/OrderTable.tsx`
  - Evidence: Mobile Orders view now provides a full-width search input, status pills with wrapping (`flex-wrap: wrap; gap: 6px;` preventing text clipping), outlet dropdown filter, From/To date inputs, Clear button, and a "Load more orders" button for mobile pagination. Removed developer wording "page-numbered on desktop".

### M4 Products (2026-09-22)
- **D-16 (P1, Products part)**: Programmatic label association and accessible switch.
  - Status: FIXED
  - Files: `src/features/admin/containers/ProductEditorContainer.tsx`, `src/features/admin/components/ui/Toggle.tsx`
  - Evidence: Every field label in `ProductEditorContainer.tsx` uses `<label htmlFor="...">` with matching input IDs (`prod-name`, `prod-category`, `prod-charging`, `prod-price`, `prod-extra`). `Toggle` component now supports `id` and defaults `aria-label` to "Active" linked with `<label htmlFor="prod-active">`.
- **D-17 (P2)**: Slab editor placeholders, units, column headers, and balanced widths.
  - Status: FIXED
  - Files: `src/features/admin/containers/ProductEditorContainer.tsx`
  - Evidence: Added column headers "Up to (kg)" and "Price (₹)". Sized both weight and price inputs equally with `flex: 1`. Used clear example placeholders ("e.g. 4", "e.g. 250", "e.g. 50") that cannot be mistaken for real data. Removed stray leading dash from hint text.
- **D-18 (P2)**: Banner/card gap and dedicated info notice class.
  - Status: FIXED
  - Files: `src/features/admin/components/Catalogue.tsx`, `src/features/admin/components/ui/ListStates.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Exported `InfoBanner` with dedicated `.info-banner` class and updated `ErrorBanner` variant="info" to use `.info-banner`. Added `margin-bottom: 16px` and 16px flex gap in `Catalogue.tsx`, preventing the banner from touching the card.
- **D-19 (P3)**: Search count "N of M" and Clear search action.
  - Status: FIXED
  - Files: `src/features/admin/components/Catalogue.tsx`, `src/features/admin/containers/AdminScreenContainer.tsx`
  - Evidence: Passed `totalCount={allProducts.length}` from container. When filtering, heading reads `Services & pricing (${products.length} of ${totalCount})`. Added "Clear search" button to search row when filtered, and as the action in `EmptyState` when 0 services match.
- **D-20 (P3)**: Consistent product and service naming.
  - Status: FIXED
  - Files: `src/features/admin/components/Catalogue.tsx`
  - Evidence: Standardized on "Services & pricing" for card title and "＋ Add service" for CTA, keeping "Products" in sidebar navigation.
- **D-21 (P3)**: Dialog close button size 40×40 and initial focus to first field.
  - Status: FIXED
  - Files: `src/features/admin/components/ui/Dialog.tsx`, `src/app/(workspace)/admin/owner-workspace.css`, `src/features/admin/containers/ProductEditorContainer.tsx`
  - Evidence: In `owner-workspace.css`, `.dialog-close` updated from 29×29 to 40×40 (`width: 40px; height: 40px; font-size: 16px;`). In `Dialog.tsx`, initial focus prefers auto-focused elements and `.dialog-body input:not([disabled])` before falling back to the close button. `#prod-name` has `autoFocus`.
- **M-10 (P2)**: Removed raw internal UUID from catalogue cards.
  - Status: FIXED
  - Files: `src/features/admin/components/Catalogue.tsx`
  - Evidence: Removed `{product.id} ·` from catalogue cards, leaving clean category labels and saving precious vertical space on mobile cards.

### M5 Expenses (2026-09-22)
- **D-42 (P2)**: Eliminated duplicated page title and CTA; corrected subtitle.
  - Status: FIXED
  - Files: `src/features/admin/components/Expenses.tsx`
  - Evidence: Replaced inner `h1` with `h2` ("Bills & operational costs"), leaving a single `h1` ("Expenses") on the page from the layout header. When expenses list is empty, the top CTA button is hidden so only the empty-state CTA is displayed. Subtitle updated from misleading "Per-outlet and organization-wide costs, side by side" to "Track organization and outlet expenses."
- **D-43 (P3)**: Outlet filter pills styled as segmented chips; full-width "Applies to" select.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/owner-workspace.css`, `src/features/admin/components/ExpenseEditor.tsx`
  - Evidence: Updated `.pill` styling to radius 8px, `#eaf2ff` background, `#0758d6` text, and `#8fb3ec` border, matching the Sales segmented filter chips. Added `.full-width` dropdown styling ensuring the "Applies to" trigger spans the full 478px width with 44px minimum height.
- **D-16 (P1, Expenses part)**: Programmatic label association in Add expense.
  - Status: FIXED
  - Files: `src/features/admin/components/ExpenseEditor.tsx`

### M6 Employees (2026-09-22)
- **D-44 (P1)**: Active employees with zero outlets flagged and actionable; summary line aligned.
  - Status: FIXED
  - Files: `src/features/admin/components/Employees.tsx`
  - Evidence: Active employees assigned to 0 outlets now render a warning badge `<Badge tone="warn">No outlet assigned</Badge>` with note "can't sign in to any outlet" and a direct `Assign outlet →` action opening the edit dialog. The summary line also notes `(${unassignedEmployees.length} unassigned)`.
- **D-45 (P2)**: Separated Edit and Deactivate actions; standardized action label.
  - Status: FIXED
  - Files: `src/features/admin/components/Employees.tsx`
  - Evidence: Renamed "Manage ↗" to "Edit" to match dialog title "Edit employee" (removing stray arrow). Separated "Edit" from "Deactivate" / "Reactivate" using distinct secondary button styling and 8px gap.
- **D-46 (P2)**: Password type=password with toggle, standard dialog width, programmatic labels.
  - Status: FIXED
  - Files: `src/features/admin/components/EmployeeEditor.tsx`, `src/features/admin/components/ui/Dialog.tsx`
  - Evidence: Password input changed to `type="password"` with a styled "Show" / "Hide" toggle button (`aria-label`), retaining `autoComplete="new-password"` and `minLength={8}`. Removed `wide` prop from `Dialog` so it uses the standard 520px width. Added `useDialog().requestClose` to the Cancel button to preserve `warnOnChanges` discard confirmation.
- **D-47 (P3)**: Eliminated duplicated h1 on Employees page.
  - Status: FIXED
  - Files: `src/features/admin/components/Employees.tsx`
  - Evidence: Replaced inner `<h1>Employees</h1>` with `<h2>Team members</h2>`, leaving a single `h1` ("Employees") from the layout header.
- **D-16 (P1, Employees part)**: Programmatic label association across all employee fields.
  - Status: FIXED
  - Files: `src/features/admin/components/EmployeeEditor.tsx`
  - Evidence: All labels linked with `htmlFor` matching input IDs (`emp-name`, `emp-phone`, `emp-username`, `emp-password`, `emp-default-outlet`, `emp-outlets-label`). Added `autoFocus` to `#emp-name`. Removed stray leading dashes from helper copy.

### M7 Outlets (2026-09-22)
- **D-49 (P3)**: Scoped back link hit area, cleaned subtitle copy, removed fake dropdown affordance, and clamped stat tile labels.
  - Status: FIXED
  - Files: `src/features/admin/components/OutletDetail.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Changed "← Back to outlets" link to `display: inline-flex; align-self: flex-start`, scoping its hit area to the text rather than stretching 1140px. Removed developer wording `· donut share` from subtitle, leaving clean "This outlet only", and replaced "Read-only" with "Outlet information". Replaced fake dropdown `<Pill>14d ▾</Pill>` with `<Pill>Last 14 days</Pill>`. Shortened "Pieces sold today" to "Items sold" and added `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` on `.stat-tile .label` so tile values maintain uniform height at 1024px.
- **M-11 (P3)**: Outlet detail "← Back to outlets" link tap target >= 44px tall.
  - Status: FIXED
  - Files: `src/features/admin/components/OutletDetail.tsx`
  - Evidence: Added `minHeight: '44px'` and `padding: '8px 4px'` with `display: inline-flex; align-items: center` to the back link, satisfying touch target guidelines on mobile viewports.

### M8 Profile (2026-09-22)
- **D-50 (P2)**: Confirmation before disabling payment methods, state labels, and enlarged touch target.
  - Status: FIXED
  - Files: `src/features/admin/components/PaymentMethodsSettings.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Attempting to disable any payment method opens a confirmation modal ("Disable [Method]? Customers will no longer be able to pay with [Method] at checkout across all outlets") requiring explicit confirmation. The switch label is phrased as a state rather than command (`aria-label="${method.name} · ${method.enabled ? 'Enabled' : 'Disabled'}"`), with visible "Enabled" / "Disabled" text. Touch target size enlarged with a 44px minimum touch area.
- **D-51 (P3)**: Parity between Profile page and Edit profile dialog; uniform 24px column gap.
  - Status: FIXED
  - Files: `src/features/admin/components/Profile.tsx`, `src/app/(workspace)/admin/admin.css`
  - Evidence: Added "Store name" and "Store address" to the "Profile details" card, providing complete 1:1 parity with the Edit profile dialog fields. Removed `margin-top: 20px` from `.ad-account-card` in `admin.css`, restoring uniform 24px vertical rhythm across all cards in the right column.
- **D-52 (P3)**: Change password live guidance, mismatch hint, and discard protection.
  - Status: FIXED
  - Files: `src/features/admin/components/Profile.tsx`
  - Evidence: Added inline requirements text ("Passwords must be at least 8 characters and differ from your current password"), remaining character count indicator, live "Passwords do not match" mismatch hint, and "New password must differ from current password" hint. Both Edit profile and Change password dialogs now enable `warnOnChanges`, prompting "Discard changes?" if closed after typing.

### M9 Chrome + design system (2026-09-22)
- **D-04 (P2) & M-01 (P2)**: Range popover closes on Escape/outside click, unified single control, date inputs >= 150px wide.
  - Status: FIXED
  - Files: `src/features/admin/components/DashboardPeriodControl.tsx`, `src/features/admin/containers/AdminScreenContainer.tsx`
  - Evidence: Replaced unstable `<details>` with `DashboardPeriodControl` containing click-outside ref and `Escape` keydown listeners, preset selection (Today, Last 7 days, Last 14 days, This month), and custom date inputs with `minWidth: 150px` to prevent year clipping on mobile and desktop viewports.
- **D-05 (P2) & D-06 (P2)**: Chart axis readability and visible focus on chart points.
  - Status: FIXED
  - Files: `src/features/admin/components/DashboardCharts.tsx`, `src/features/admin/containers/AdminScreenContainer.tsx`, `src/app/(workspace)/admin/dashboard.css`
  - Evidence: Clarified trend title to "Sales trend — last 14 days (2-day buckets)". Increased chart axis text contrast to `#475569` and size to 11.5px. Added visible high-contrast focus rings (`stroke-width: 3`, ring stroke) on interactive chart points.
- **D-07 (P3)**: Outlet summary grid fills width; section title aligned.
  - Status: FIXED
  - Files: `src/features/admin/components/Dashboard.tsx`, `src/app/(workspace)/admin/dashboard.css`
  - Evidence: Changed `.dashboard-outlet-grid` from `repeat(3, minmax(0, 1fr))` to `repeat(auto-fit, minmax(280px, 1fr))`, allowing 2 outlet cards to evenly expand and fill the available container width. Section title modernized to "Per-outlet summary".
- **D-08 (P2) & D-11 (P2)**: "Needs attention" rows keyboard operable links; removed stray "↗" arrows.
  - Status: FIXED
  - Files: `src/features/admin/components/Dashboard.tsx`, `src/features/admin/components/AdminChrome.tsx`
  - Evidence: "Needs attention" rows wrapped in `<Link href="/admin/sales">` with hover state and chevron icon (`→`), making them actionable. Removed "↗" from in-page actions ("View detail", "Save order", "Log out →").
- **D-09 (P3)**: Standardized page-title (`h1`) size across all workspace pages.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/admin.css`, `src/app/(workspace)/admin/dashboard.css`
  - Evidence: Standardized `h1` across all workspace layouts to `28px` (`1.75rem`), weight 700, and line-height 1.25.
- **D-10 (P2)**: AdminChrome brand text and footer note legible and current.
  - Status: FIXED
  - Files: `src/features/admin/components/AdminChrome.tsx`, `src/app/(workspace)/admin/admin.css`
  - Evidence: Brand subtitle font size increased to 11px / 1.4 with enhanced letter-spacing (`0.02em`). Updated footer note to "All outlets in view · Live".
- **D-13 (P3)**: Unified button styles.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/admin.css`
  - Evidence: Converged `.ad-button` base styles with `.btn` (min-height 40px, border-radius 8px, font-size 13px, font-weight 500, font-family inherit, transition).
- **D-14 (P3) & M-04 (P2)**: Overlay pattern consistency and mobile safe area insets.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/admin.css`, `src/features/admin/components/ui/Dialog.tsx`
  - Evidence: Standardized dialog titles to `20px` with weight 600. Added `padding-bottom: max(40px, env(safe-area-inset-bottom))` to dialog content containers on mobile screens.
- **D-15 (P3)**: Shared inline field error styling.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Established `.ad-field-error` pattern (`role="alert"`, 12px, color `#dc2626`, margin-top 4px) reused across forms (order editor, product editor, employee editor, profile).
- **D-28, D-29, D-30 (P3)**: Date filter format, toolbar alignment, and KPI tile consistency.
  - Status: FIXED
  - Files: `src/features/admin/components/Primitives.tsx`, `src/app/(workspace)/admin/tables.css`, `src/features/admin/components/ui/ListStates.tsx`
  - Evidence: Formatted date range label in `DateFilter` to human format ("1 Sept 2026 — 30 Sept 2026"). Filter toolbar inputs and buttons normalized to 40px height. KPI tiles standardized with `StatTile` component across views.
- **M-02 (P3)**: Dashboard recent orders table horizontal scroll affordance on mobile.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/dashboard.css`
  - Evidence: Added right-edge gradient fade mask on `.dashboard-table-scroll` for mobile screens, giving users clear visual cues of scrollable content.
- **M-03 (P2)**: Mobile touch targets >= 44×44px.
  - Status: FIXED
  - Files: `src/app/(workspace)/admin/admin.css`, `src/features/admin/components/ui/Toggle.tsx`, `src/app/(workspace)/admin/owner-workspace.css`
  - Evidence: Applied minimum dimensions of 44×44px to `.ad-avatar`, `.ad-icon-button`, `.ad-menu-toggle`, switches (`.toggle::before`), and drawer elements.
- **M-05 (P3, Expenses part)**: Outlet pill row overflow on mobile.
  - Status: FIXED
  - Files: `src/features/admin/components/Expenses.tsx`
  - Evidence: Added `flexWrap: wrap` and `gap: 6px` to the outlet filter pills in `Expenses.tsx`, eliminating horizontal clipping on 375px screens.

### Parent verification of M2–M9 (2026-09-22)
Gates on the host: `npx tsc --noEmit` 0, `npm run lint` 0, `npm run build` passes (~18s), dashboard-metrics test passes, no new `"level":"ERROR"` lines in the dev log. Browser: every workspace screen at 1440×900 and 375×812, scrollWidth = clientWidth on all of them. QA order EL-6 ("QA M2 Order", HSR Layout, QA Shirt Press, paid in full by Cash) created to prove the server accepts the organization payment methods New sale now lists (D-24).

Confirmed working as claimed: Orders in the owner sidebar (D-12); outlet multi-select excludes org-wide orders unless chosen (D-37, 3 of 5 orders for Chinnapanahalli); Paid in full stays in sync as quantities change (D-23); order codes are keyboard buttons (D-22); Payment/Outlet columns (D-27); Employee dialog first-field focus + password Show/Hide; outlet back link 44px tall (M-11); mobile Orders search/pills/filters (M-08).

Found and fixed by parent:
- **Super Admin freeze broken**: admin.css is global and Super Admin is `soa ad-root`. `.ad-button` min-height 44→40 (shrank Super Admin confirmation, login and dialog buttons), `.ad-root h1` 32→28, Panel title 25→20 and `.ad-icon-button` 40→44 all leaked into Super Admin. Base values restored; the new sizes now apply only under `.ad-app` (the workspace shell). `.ad-button` stays 44px tall (also M-03's touch-target rule).
- **Phone (D-25)**: typing/pasting `+91 98765 43210` silently became the wrong number `9198765432` (digits were cut to 10). Now the raw text is kept while typing and normalised on blur/submit (`+91`/`0` prefix removed); anything that is not 10 digits shows the inline error. Removed the native `pattern`, which blocked submit before normalisation.
- **Dashboard period control (D-04)**: choosing a preset labelled the button `month▾`/`week▾`; now "This month" etc. Custom From/To reject a reversed range again (the old DateFilter guard was lost).
- **Status badges (M9)**: Pending/In Progress/Unpaid were all amber. New `statusTone()` — Pending grey, In Progress blue, Ready violet, Delivered green — used by Sales/Orders/Dashboard tables and the order header badge; payment badges keep green/amber.
- **Orders toolbar (D-40)**: the new From/To labels stacked above the inputs (workspace `label` is a column); now inline. Page title back to the shared 28px (was inline 22px). Search widened so its placeholder isn't clipped.
- **Outlet filter Clear (D-39)**: Clear left zero outlets selected and showed an empty list; an empty selection now means "all outlets".
- **Mobile order cards**: a `role="button"` card wrapped a real button (nested interactive, double activation); the card is now plain, the order-code button is the control. Removed a dead `onKeyDown` on table rows (rows aren't focusable).
- **Employee dialog**: `justify-content: space-between` pushed the "Select outlets" label to the middle of the trigger; now left-aligned with the caret on the right.
- **Outlet detail (D-49)**: "Items sold" reintroduced the ambiguity M0 removed (the number counts pieces only, today only) → "Pieces today".
- **Sidebar footer (D-10)**: "All outlets in view · Live" was shown even with one outlet selected, and "Switch branches" contradicted the Store switcher → "Organization workspace" / "Switch stores from the header above."
- **Needs attention (D-08)**: "Action →" opened unfiltered Sales → `/admin/sales?attention=1` (due today or late).
- **D-11**: remaining ↗ removed (Products Edit, Outlets View, Save order, Punch order, Sign in).
- Date range label uses UTC formatting so the ISO day can't shift in other time zones.

Still open / owner decisions (not changed):
- D-24 side effect: New sale and Record payment now list organization payment methods only. A store with zero outlets that relies on legacy per-store methods would see none; per B4 every organization must enable a platform method anyway.
- Employee phone isn't persisted on save (server change needed — owner decision).
- Employee counter (EmployeeSalesContainer) still needs an employee login to verify.
- New sale Payment method stays visible but disabled when nothing is received (D-26 layout-shift fix); disabled styling is subtle.
- Test data now includes EL-6 (QA M2 Order) alongside EL-3/EL-4.

