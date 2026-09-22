# UI review fix status

| Module | Findings | Status | Checks (tsc / lint / build / browser) |
|---|---|---|---|
| M0 Data correctness | D-01 D-02 D-03 D-48 | DONE (parent-verified) | tsc 0; lint 0; build passes; dashboard-metrics test passes; browser 1440 + 375 verified by parent |
| M1 Order details | D-31–D-36 M-09 | DONE (parent-verified) | tsc 0; lint 0; build passes; browser 1440 + 375 verified by parent |
| M2 Sales + New sale | D-22–D-30 M-05 M-06 | TODO | |
| M3 Orders + nav | D-12 D-37–D-41 M-05 M-07 M-08 | TODO | |
| M4 Products | D-16 D-17–D-21 M-10 | TODO | |
| M5 Expenses | D-16 D-42 D-43 | TODO | |
| M6 Employees | D-16 D-44–D-47 | TODO | |
| M7 Outlets | D-49 M-11 | TODO | |
| M8 Profile | D-50–D-52 | TODO | |
| M9 Chrome + design system | D-04–D-11 D-13–D-15 D-28–D-30 M-01–M-05 | TODO | |

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
