# CSS refactor — live status

**Single source of truth.** Update this file *before* starting a phase and
*immediately after* finishing one. Commit the edit. Never let progress exist only
in an agent's context.

Branch: `chore/backend-and-setup`
Plan: [`../CSS-THEME-REFACTOR-PLAN.md`](../CSS-THEME-REFACTOR-PLAN.md)
Protocol: [`PROTOCOL.md`](PROTOCOL.md)

Legend: `NOT_STARTED` · `IN_PROGRESS` · `BLOCKED` · `REVIEW` · `DONE`

## Foundation — strictly sequential, no parallelism

| # | Phase | Status | Agent | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 0 | Toolchain + baseline | NOT_STARTED | — | — | |
| 1 | Containment (fixes reported symptom) | NOT_STARTED | — | — | |
| 2 | Icon + Button + Badge | NOT_STARTED | — | — | |
| 3 | Card, StatTile, KeyValue, PageHeading, Notice | NOT_STARTED | — | — | |
| 4 | Dialog (highest risk — alone) | NOT_STARTED | — | — | |
| 5 | Table, EmptyState, Filters, Pagination, Dropdown, Toggle, RowMenu | NOT_STARTED | — | — | |
| 6 | AppShell (unified sidebar) | NOT_STARTED | — | — | |

## Screen migration — parallel-capable once Phase 6 is DONE

Each phase owns a disjoint file set. Agents take **non-adjacent** phases and work
in separate git worktrees. Rebase before starting; run the full gate before
committing.

| # | Phase | Status | Agent | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 7 | Products (Catalogue) | NOT_STARTED | — | — | |
| 8 | Orders | NOT_STARTED | — | — | largest surface |
| 9 | Sales / POS counter | NOT_STARTED | — | — | must land after 8 |
| 10 | Expenses | NOT_STARTED | — | — | |
| 11 | Employees | NOT_STARTED | — | — | |
| 12 | Profile + Payment methods | NOT_STARTED | — | — | |
| 13 | Outlets | NOT_STARTED | — | — | |
| 14 | Dashboard + charts | NOT_STARTED | — | — | |

## Closeout — sequential, after all of the above

| # | Phase | Status | Agent | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 15 | Remaining Super Admin screens | NOT_STARTED | — | — | |
| 16 | Teardown | NOT_STARTED | — | — | only when orphan count is zero |

## CSS line ledger

| Checkpoint | Total CSS lines | Orphaned selectors |
| --- | --- | --- |
| Baseline (pre-Phase 0) | 2044 | not yet measured |
| Target | 150–250 | 0 |

## Open decisions

| # | Decision | Raised in | Status |
| --- | --- | --- | --- |
| D1 | Merge `InvoicePdfViewer`/`OrderInvoicePdfViewer` and `InvoiceActions`/`OrderInvoiceActions`? `CURRENT-STATE.md` records the split as deliberate. | Phase 6 | OPEN — do not merge silently |

## Cross-phase findings

Anything one agent learns that another needs. Append only.

_(none yet)_
