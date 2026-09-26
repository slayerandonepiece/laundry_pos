# Agent D — Screens polish — fix report

Scope: Q-07, Q-08, Q-10, Q-11, Q-14, P-01, plus the Profile checkbox audit.
Files touched (all within ownership): `src/features/admin/components/OutletsList.tsx`,
`src/features/admin/components/DashboardCharts.tsx`,
`src/features/admin/containers/ProductEditorContainer.tsx`,
`src/features/admin/components/Profile.tsx`,
`src/app/(workspace)/admin/owner-workspace.css` (only `.pill` rule + a new
outlet-list block, mirroring the existing `.catalogue-*` block).
No writes/saves performed in the browser; all dialogs were Cancelled.

## Q-07 — Outlets list has no mobile layout (S2)
**Status: fixed.**
- Root cause: `OutletsList.tsx:33-71` rendered only a `<div style={{overflowX:'auto'}}><table>`,
  no mobile card fallback — unlike Products' `Catalogue.tsx`, which already ships a
  `.catalogue-table-wrap` (table, hidden ≤767px) + `.catalogue-cards` (cards, shown ≤767px) pair.
- Fix: `OutletsList.tsx` now renders the same two-block pattern — table wrapped in
  `.outlet-table-wrap`, plus a parallel `.outlet-cards` list of `.outlet-card` `<article>`s
  (name, address, badge, code + opened date, and a real `View ↗` link) — added directly after
  the existing table markup, same component, same data, no duplication.
- CSS added to `owner-workspace.css` right after the existing `/* Catalogue (Products) */`
  block: `.outlet-table-wrap`/`.outlet-cards`/`.outlet-card` (identical shape to
  `.catalogue-table-wrap`/`.catalogue-cards`/`.catalogue-card`) plus `.outlet-card-view { min-height: 40px }`
  for the touch target.
- Before → after (375px): table wrap `display:none`, cards `display:flex`, 2 cards rendered,
  `View` link height 40px (was inside a 68px-wide squeezed `<td>` at 375, 7-line name wrap).
  No horizontal scroll (`scrollWidth === clientWidth === 375`).
- At 768px (above the shared `max-width:767px` breakpoint, same as Products): table remains
  visible, name column still wraps across ~3 lines. This mirrors how Products' own
  `.catalogue-table-wrap`/`.catalogue-cards` pair behaves at the identical breakpoint — not a
  new regression, and fixing it would mean changing the shared `table.grid` rule used by every
  list table in the app (out of ownership/scope; see cross-agent note below).
- At 1440px: table shown, cards `display:none`, no overflow — unaffected.
- Tested: DOM measurement (`getBoundingClientRect`, `getComputedStyle`) at 375/768/1440 in my
  own tab; one screenshot taken at 375 as evidence.

## Q-08 — empty Dashboard sales chart draws a fabricated axis (S2)
**Status: fixed.**
- Root cause: `DashboardCharts.tsx`'s `SalesChart` always drew the `₹100/₹66.7/₹33.3` axis
  labels off the `Math.max(..., 10000)` fallback `maximum`, even when every point was ₹0 — so
  the "No booked sales in this period." message rendered next to a populated-looking axis.
- Fix: added `const hasData = [...points, ...previousPoints].some(point => point.amount > 0)`
  and gated the axis-label `<text>` block on it (`{hasData && [1, 2/3, 1/3].map(...)}`). The
  neutral dashed gridlines (no values) and the SVG's fixed `viewBox` height are untouched, so
  the chart area's height doesn't move when the labels disappear.
- Before → after: live empty-period dashboard (`todaySales ₹0`, 0 orders) — before, axis
  showed `₹100`/`₹66.7`/`₹33.3`; after, `svg text` content is only the 3 date-range labels,
  no fabricated money values. Chart height unchanged (150px). Screenshot taken.
- Tested: `javascript_exec` reading all `<text>` nodes in the chart `<svg>` at 1440 and 375 —
  both clean, no page-level horizontal scroll at either width.

## Q-10 — Add service submit button always reads "Save changes" (S3)
**Status: fixed.**
- Root cause: `ProductEditorContainer.tsx:53` hardcoded `Save changes` regardless of create vs.
  edit.
- Fix: `{product ? 'Save changes' : 'Add service'}`, matching the existing app convention —
  `EmployeeEditor.tsx:99` uses the identical ternary shape (`employee ? 'Save changes' : 'Save & create login'`).
- Verified via `read_page`: Add-service dialog now shows `button "Add service" type="submit"`;
  opening Edit on "Wash, Dry & Fold" shows `submitLabel: "Save changes"`.

## Q-11 — Profile phone field's accessible name comes from `title` (S3)
**Status: fixed.**
- Root cause: `Profile.tsx`'s phone `<input>` had `title="Enter a valid phone number with 10 to
  15 digits"` and no `aria-label`, and the label association was losing to the title in the
  accessible-name computation an AT would read (`title` was the reported accessible name).
- Fix: added `aria-label="Phone"` to the same `<input>` — `title` (tooltip text) and the
  `pattern` (validation) are both untouched.
- Verified: `read_page` accessibility tree now shows `textbox "Phone" type="tel"` for that
  field; `javascript_exec` confirms `title`, `pattern`, and `required` are byte-identical to
  before, with `aria-label: "Phone"` added.

## Q-14 — Expenses outlet filter pills 35px tall on mobile (S3)
**Status: fixed.**
- Root cause: the shared `.pill` rule (`owner-workspace.css`, used by `ui/Pill.tsx`, consumed
  by `Expenses.tsx`'s outlet filter) had `padding: 6px 14px` and no minimum height, measuring
  35px tall at 375px.
- Fix: added a `@media (max-width: 767px) { .pill { min-height: 40px; } }` block directly
  after the existing `.pill`/`.pill:hover`/`.pill.active` rules — touch-only, no change at
  desktop widths, no change to horizontal padding/shape.
- Before → after (375px, Expenses "All"/"Organization-wide"/outlet pills): 35px → 40px height
  on all 4 pills. Screenshot taken. This is a shared class also used by `OrderTable.tsx` and
  `OutletDetail.tsx` filter pills (not owned by me) — they get the same touch-target
  improvement for free since it's the same CSS class; flagged under cross-agent notes in case
  Agent C wants to independently verify Sales' own pill usage.

## P-01 — Add service "By weight" pre-fills real slab values, not placeholders
**Status: fixed.**
- Root cause: `ProductEditorContainer.tsx`'s `useState` defaults, when `product` is undefined
  (brand-new service), set real `value`s: `slabs = [{limit:4,price:27900},{limit:6,price:37900}]`,
  `extra = 4900` — a careless Save created a fully-priced service the owner never typed.
- Fix:
  1. New-service defaults changed to blank: `slabs = [{limit:0,price:0},{limit:0,price:0}]`,
     `extra = 0`. Since the inputs already render `value={s.limit || ''}` /
     `value={s.price ? s.price/100 : ''}` / `value={extra ? extra/100 : ''}`, a `0` now
     correctly renders as an empty field.
  2. The same numbers that used to be real values (4, 279, 6, 379, 49) are now the
     `placeholder`s on those exact inputs (`slabExamples = [{limit:'4',price:'279'},
     {limit:'6',price:'379'}]`, extra `placeholder="49"`), so the owner still sees the example
     shape without it being submittable by accident. Rows beyond the first two (added via
     "+ Add price slab") keep the pre-existing generic `"Up to (kg)"`/`"₹"` placeholders.
  3. Required + min validation was already present (`required`, `min=".01"` on all three weight
     fields) — untouched, now actually meaningful since defaults are blank.
  4. Editing an existing weight product is unaffected: the `useState` branch for
     `product?.type === 'weight'` was already, and remains, `product.slabs`/`product.extra`
     (real saved values).
- Verified live (own tab, no saves):
  - New service → weight mode: `input.value` for all 5 fields is `""`; placeholders read
    `"4"/"279"/"6"/"379"/"49"`; `document.getElementById('product-form').checkValidity()` →
    `false` (native validation blocks submit with blank slabs, confirmed without submitting).
  - Edit "Wash, Dry & Fold" (a real weight service): values loaded as `4/279/6/379/50` (real
    data, not placeholders); submit label correctly read "Save changes".
- Cancelled both dialogs; no save attempted.

## Profile hand-rolled checkboxes (task 7)
**Status: no change needed — verified, not a multi-select.**
`Profile.tsx` has exactly one `type="checkbox"`: the "Show passwords" toggle in the Change
Password dialog (a single independent boolean, not a multi-select). `Profile.tsx` also renders
`<PaymentMethodsSettings>` (a separate file, not in my ownership list, and already using the
shared `Toggle` per CURRENT-STATE.md) — left untouched, and its instant-save toggles were not
interacted with per the brief. No genuine hand-rolled multi-select exists in any file I own.

## Gate counts
- `npx tsc --noEmit --incremental false`: 10 error lines before and after (5 in `scratch/`,
  ignored per FIX-PLAN; 5 real, pre-existing, in `src/app/(workspace)/admin/profile/page.tsx`
  and `src/features/admin/containers/AdminScreenContainer.tsx` — neither touched by me, both
  present before my first edit). **Zero new errors.**
- `npx eslint .`: 9 problems before and after (1 error + 3 warnings in
  `src/app/(workspace)/admin/orders/page.tsx`, 5 warnings in `scratch/ProductEditorContainer.tsx`
  — ignored). **Zero new warnings/errors.**

## Cross-agent requests
- None blocking. FYI only: the `.pill` min-height fix (Q-14) is class-shared, so it also raises
  touch targets on Sales'/Order-detail's own pill usage (`OrderTable.tsx`, owned by Agent C) —
  no action needed unless Agent C wants to double check their own pill screenshots.

## New findings (not fixed, flagged only)
- At 768px, `OutletsList`'s table (not the new card fallback, which only activates ≤767px)
  still wraps the outlet name across ~3 lines. This is identical to how `Catalogue.tsx`'s own
  table/`table.grid` behaves at the same width for long names — a shared-table-styling
  limitation across every list screen, not specific to Outlets. Fixing it would mean changing
  the global `table.grid`/column-width rules used by every screen's tables, which is out of my
  file ownership. Worth a follow-up if the owner wants 768px specifically addressed.
