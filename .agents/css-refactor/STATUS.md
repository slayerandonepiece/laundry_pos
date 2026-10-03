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
| 0 | Toolchain + baseline | BLOCKED | baseline-p0 | `bfebfef` | Capture tooling done and proven (`scripts/capture-superadmin-baseline.mjs`, 54 shots, `--compare` gate). Baseline PNGs **not** captured: Phase 0's own Tailwind utilities layer regresses Super Admin (`.outline` collision, F5), so a capture now would freeze a regressed reference. Re-run the script once F5 is fixed. |
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
| Baseline (pre-Phase 0) | 2044 | 152 |
| After Phase 0 | 2162 | 152 |
| Target | 150–250 | 0 |

Measured with `node scripts/check-css-orphans.mjs --count`. Phase 0 adds
`app.css` (118 lines) and deletes nothing, and `app.css` declares no class
selectors, so the orphan count is unmoved by construction. The script
over-reports "used" and never invents an orphan, so 152 is a **floor** on the
real dead-selector count — always confirm with `graft grep` before deleting.

## Open decisions

| # | Decision | Raised in | Status |
| --- | --- | --- | --- |
| D1 | Merge `InvoicePdfViewer`/`OrderInvoicePdfViewer` and `InvoiceActions`/`OrderInvoiceActions`? `CURRENT-STATE.md` records the split as deliberate. | Phase 6 | OPEN — do not merge silently |

## Cross-phase findings

Anything one agent learns that another needs. Append only.

- **F1 · Phase 0 · The gate is red before you start.** `npx tsc --noEmit` reports
  **8** errors and `npx eslint .` **2** errors on a tree with zero CSS-refactor
  changes, all from other agents' in-flight uncommitted work (`scratch/*.tsx`,
  the `OrganizationPaymentMethodDTO` vs `StorePaymentMethod` migration in
  `profile/page.tsx` + `AdminScreenContainer.tsx`, `orders/page.tsx`,
  `OutletDetail.tsx`). `npm run build` compiles CSS fine and then fails type
  checking on those same 8. Diff against these counts; anything above them is
  yours. Do not "fix" them — that is someone else's live work.
- **F2 · Phase 0 · Tailwind Preflight is deliberately not imported.** The plan's
  `@import "tailwindcss"` would apply `*{margin:0;padding:0}` wherever no
  existing rule sets those, which is a visual change. `app.css` imports the
  theme + utilities layers only. Full reasoning, and proof that border utilities
  still work without it, in the P00 Handoff log. Adopt Preflight deliberately in
  a later phase, against the screenshot baseline.
- **F3 · Phase 0 · The untracked `scratch/` folder is not a consumer.**
  `graft grep` indexes it, so it will show hits for classes nothing live uses —
  `.ad-table-wrap`'s only hit anywhere is `scratch/Catalogue.tsx`.
  `check-css-orphans.mjs` correctly scans `src/` only.
- **F4 · Phase 0 · `--self-check` guards the audit's original mistake.**
  `node scripts/check-css-orphans.mjs --self-check` asserts `.pill` (referenced
  only from a backtick template literal in `ui/Pill.tsx`) is not reported
  orphaned. Run it after any change to that script.
- **F5 · Phase 0 · Tailwind's utilities layer collides with the app's semantic
  class names.** Found by the coordinator while `baseline-p0` was capturing.
  Tailwind's source scanner emits a real utility for any bare token in source
  that is a valid utility name, so `.outline` (used as `className="btn outline"`
  in 17 Super Admin files) now draws a 1px outline — `.soa .btn.outline` sets no
  `outline-*` property, so nothing opposes it. That is a freeze violation.
  `.grid` (`<table className="grid">`, 7 workspace components) is broken the
  same way. `.block` and `.grow` are safe (checked). **The visual baseline
  cannot be captured until this is fixed**, or it would enshrine the
  regression as the reference.
- **F6 · Phase 0 · The capture gate is a pixel diff, not a SHA match.**
  Repeat captures of an unchanged UI are byte-identical for ~44/54 screens;
  the other ~10 drift by a few dozen antialiased glyph-edge pixels (max channel
  delta 23), which is macOS text rasterisation, not CSS. So run
  `node scripts/capture-superadmin-baseline.mjs --out <tmp> --ids
  .agents/css-refactor/baseline/ids.json --compare .agents/css-refactor/baseline`
  and read its verdict — do not `shasum` the directories and call a mismatch a
  regression. The tolerance is 0.1% of pixels AND max channel delta 32;
  anything above either is reported `CHANGED` and exits non-zero. A real
  regression is far above it: the Next dev-overlay artefact that this script
  had to strip was 0.18–2.3% of pixels at delta 231.
- **F7 · Phase 0 · `--ids` is mandatory on every re-capture.** Dynamic routes
  are captured against real rows from the dev database. The baseline writes
  `ids.json`; a capture against different ids renders different content and is
  not a valid diff. `/super-admin/subscriptions/billing` is skipped: it is a
  redirect-only route with no UI of its own.

