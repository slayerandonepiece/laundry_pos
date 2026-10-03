# Dashboard canvas synchronization

Scope: Dashboard only. Preserve server queries, authorization, outlet aggregation and shared module behavior. Starting tree contains prior uncommitted work; it must be retained.

## Canonical sources and resolved decisions

- `.agents/design-export/Dashboard-SingleOutlet.dc.html` and extracted `.view.html`: single-outlet DOM structure.
- `.agents/design-export/Dashboard-AllOutlets.dc.html`: outlet cards, donut and outlet-column table.
- `.agents/design-export/shared.css`: literal tokens and component rules.
- `.agents/design-export/SharedListStates.dc.html`: shared empty/error/loading components.
- Live https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv inaccessible through web tool; export fallback used.
- Owner decision: requirements override incomplete All-outlets artboard. Order is stats → trend → outlet cards → earnings/expenses → attention → recent orders.
- Wiki read-only consultation: `.wiki/wiki/topics/architecture-overview.md` and `multi-tenant-and-outlet-model.md`. Real outlet backend is implemented; old schema-only notes are stale.

## Artifact rule to file audit (before implementation)

| Rule | Target | Change |
| --- | --- | --- |
| 212px sidebar, 58px topbar, content padding 26px 30px | AdminChrome.tsx, dashboard.css | Dashboard-scoped shell class; preserve existing shell and interactions |
| 22px heading, no eyebrow, 18px section gap | Dashboard.tsx, AdminScreenContainer.tsx | Own Dashboard heading; remove old Dashboard heading/filter row |
| Four tiles, 14px gap, 15px 17px padding, 24px mono values | Existing StatTile + scoped CSS | Use literal canvas tokens |
| 150px area chart, current/previous series, compact range pill | DashboardCharts.tsx, container | Reuse dashboardData with explicit reporting windows; no backend aggregation changes |
| Three outlet cards, 16px gap, 10px progress bars | Dashboard.tsx | Exact card DOM and spacing; responsive columns |
| 110px earnings donut | Existing EarningsDonut | Reuse existing component; Dashboard-scoped typography |
| Recent orders table inset 19px, correct columns and badges | Dashboard.tsx | Dashboard-specific compact composition using shared Badge; keep order detail callback |
| Loading/empty/error conventions | Dashboard states | Reuse ShimmerRow/Tile, EmptyState, ErrorBanner |
| Desktop/tablet/mobile/small mobile | dashboard.css | Scoped breakpoints and horizontal table scroll |

## Data mapping notes

Existing `dashboardData` owns monetary calculations, monthly paid expenses and attention counts. Recent orders must come from already-fetched orders, not its due-date-sorted open commitments. Range state remains a UI concern. No database/service/action implementation changes planned.

## Verification

- Authenticated in-app-browser verification completed against the running local workspace with a two-outlet owner account.
- `Dashboard-AllOutlets`: verified the required order in the accessibility tree and rendered page — stats → 14-day trend → two outlet cards → earnings/expenses donut → Needs attention → Recent orders with all-outlet copy. The lower three sections were also inspected after scrolling.
- `Dashboard-SingleOutlet`: selected an outlet through the restored Dashboard control and verified stats → 14-day trend → Recent orders → Needs attention, with outlet-specific headings and empty-state copy. Restored `All outlets` after the check.
- Responsive checks used the in-app browser at 768px, 390px and 320px. At 768px and 320px the document `scrollWidth` matched the viewport width; the four stats and every All-outlets section remained present. Desktop was restored afterward.
- Focused ESLint for every touched Dashboard TS/TSX file: pass.
- Dashboard-scoped `git diff --check`: pass. The repository-wide command still reports trailing whitespace in unrelated pre-existing working-tree edits.
- `npx tsc --noEmit --incremental false`: blocked by unrelated pre-existing `scratch/` import errors and Profile/payment-method DTO mismatches. No Dashboard-specific TypeScript error was reported.
- `graft build`: pass, 267 files indexed.
