# Fix round report — Agent C (Orders/Sales + chrome)

Scope: Q-02, Q-04, Q-09, Q-13, Q-15. Owned files only (see FIX-PLAN.md).

## Q-02 — status stepper wraps to a second row — FIXED

- **Root cause**: `tables.css:145` `.ad-delivery-steps{grid-template-columns:repeat(3,minmax(0,1fr));...}` hardcoded 3 columns while `OrderDeliveryDetails.tsx` renders 4 `<li>`s (Pending/In Progress/Ready/Delivered), so the 4th wrapped under the 1st.
- **Fix** (derives column count from the actual step list, so a future 5th status can't reintroduce this):
  - `src/features/admin/components/OrderDeliveryDetails.tsx:1,21` — added `import type { CSSProperties } from 'react'` and set `style={{ '--step-count': steps.length } as CSSProperties }` on the `<ol className="ad-delivery-steps">`.
  - `src/app/(workspace)/admin/tables.css:145` — `grid-template-columns:repeat(3,minmax(0,1fr))` → `repeat(var(--step-count,4),minmax(0,1fr))` (fallback `4` preserves current behavior if the variable is ever absent).
  - Checked line 57's `.ad-delivery-steps{min-width:0;max-width:100%}` rule (mobile-only, part of a `min-width:0` list) — it does not touch `grid-template-columns`, no conflict, no change needed.
- **Before → after** (DOM measurement, order EL-1, status = Delivered):
  - 1440px: before — 3 cols, "Delivered" `<li>` on its own row under "Pending". After — 4 columns × 84.8px each, all at the same `top`, one row; `aria-current="step"` correctly under "Delivered".
  - 768px: after — 4 × 71.5px, 1 row.
  - 375px: after — 4 × 71.25px, 1 row; screenshot confirms all 4 labels ("Pending", "In Progress", "Ready", "Delivered") legible on one line, current-step indicator bar correctly under "Delivered".
- **Tested**: opened EL-1's order details from Sales (read-only) at 1440/768/375 via `resize_window` + `getBoundingClientRect()`/`getComputedStyle()` on `.ad-delivery-steps` and its children; one screenshot taken at 375px as evidence.

## Q-04 — Payment summary card shrinks on mobile — FIXED (and found to be present at ALL widths, not just 375)

- **Root cause**: `tables.css:26` `.ad-detail-summary{display:grid;...;align-items:start}` is dead code — a later, unconditional (not inside any media query) rule at `tables.css:127` `.ad-detail-main,.ad-detail-summary{display:flex;flex-direction:column;gap:18px}` overrides `display` at every width, but never redeclares `align-items`, so the stale `align-items:start` from line 26 keeps cascading in and shrinks flex children (the unclassed "Payment summary" `.ad-detail-section`, which has no explicit `align-self`) to their content width.
- **Correction to the QA evidence**: `desktop.md`'s M-03 note says "Confirmed NOT present at 768px (...uses `display:grid` ...) — genuinely mobile-only." I could not reproduce a grid layout at any width — `.ad-detail-summary` computed to `display:flex` at 1440, 768, and 375 uniformly (import order: `tables.css` loads last in `src/app/layout.tsx`, so its unconditional line-127 rule always wins over line 26's grid and over `pos.css`'s own `.ad-detail-summary{display:flex}` for the POS/counter dialog variant). The Payment-summary card measured **225.09px wide at 1440, 768, and 375** (siblings 397/344/343px respectively) before the fix — i.e. this bug affects desktop too, not just mobile.
- **Fix**: `tables.css:127` — added `align-items:stretch` to the one rule that's actually live at every width: `.ad-detail-main,.ad-detail-summary{display:flex;flex-direction:column;align-items:stretch;gap:18px}`. Left line 26's grid declaration untouched (out of caution — it's currently unreachable dead code, but not mine to delete without a clearer signal it's safe to remove).
- **Before → after** (DOM measurement, same order):
  - 1440px: before 225.09px (siblings 397.2/264.8px) → after 264.8px, matching the `.ad-detail-audit` sibling exactly.
  - 768px: before 225.09px (siblings 344px) → after 344px, matching all siblings.
  - 375px: before 225.09px (siblings 343px) → after 343px, matching all siblings; screenshot confirms the card now spans full width with no blank gap.
- **Tested**: same session as Q-02, `getBoundingClientRect()` on every `.ad-detail-section` inside `.ad-detail-summary`/`.ad-detail-main` at all 3 widths, before and after the edit; one screenshot at 375px.

## Q-09 — Sales has no outlet indicator/switcher — INVESTIGATED, NOT FIXED (out of scope, needs a server/data change)

Investigated per the brief rather than assumed:
- `AdminChrome.tsx:104` only renders the `#dashboard-outlet-control` portal target when `screen === 'dashboard' && role === 'owner'`. `DashboardOutletControl.tsx` portals `ui/OutletSwitcher` into it, driven by `resolveOutletSelection()`.
- Sales' own data fetch, `src/app/(workspace)/admin/sales/page.tsx`, calls `listOrders(session.storeId)` with **no `outletId`** — it does not call `resolveOutletSelection()` at all (only `resolveStoreSelection()`, which is the *multi-store* owner concept, unrelated to outlets within one store). `listOrders()` does support an optional `{ outletId }` filter (used by the Dashboard page), but Sales never passes it, so **Sales currently shows every outlet's orders merged together, unfiltered** — the same is true of `orders/page.tsx` and `expenses/page.tsx` (Expenses fetches `listOutletsForStoreAdmin` only for row-label metadata, not to scope the query).
- This means `.agents/CURRENT-STATE.md`'s claim ("Dashboard, Orders, and Expenses read `resolveOutletSelection` and filter `listOrders`/`listExpenses` by the selected outlet") is stale for Orders/Expenses/Sales — only the Dashboard page (`src/app/(workspace)/page.tsx`) actually does this today.
- **Conclusion**: adding a visible outlet switcher to Sales without also making Sales' data genuinely outlet-scoped would be actively misleading (the owner could "pick" an outlet that changes nothing). Making it real requires: `resolveOutletSelection()` call in `src/app/(workspace)/admin/sales/page.tsx` (not owned by me), threading `outletId`/`allOutletsSelected`/outlet list through `AdminScreenContainer` props, and passing `{ outletId }` into `listOrders()`. That's a data/query change and page.tsx is outside my file ownership — per the brief, **stopping and reporting** rather than implementing.
- **Status: blocked — cross-agent/follow-up work**, not something this round's CSS/component-polish scope covers. No file changed for this item.

## Q-13 — topbar avatar 35×35px on mobile — FIXED

- **Root cause**: `admin.css`'s single base rule `.ad-avatar{width:35px;height:35px;...}` has no mobile override.
- **Fix**: added `.ad-avatar{width:40px;height:40px}` inside the existing `@media(max-width:767px){...}` block in `src/app/(workspace)/admin/admin.css` (right after `.ad-topbar{height:56px;...}`), touching only the avatar rule as scoped ("topbar/avatar rules only").
- **Before → after**: 375px — 35×35 → 40×40 (`getBoundingClientRect()`). 1440px (desktop) — unchanged at 35×35, confirmed unaffected.
- **Tested**: `resize_window` to 375 and 1440, `getBoundingClientRect()` on `.ad-avatar` at both.

## Q-15 — Escape on "New sale" panel — CONFIRMED test-automation artefact, not a real bug; no fix needed/possible in an owned file

- Read `Primitives.tsx`'s `Panel` (not owned, read-only): it relies solely on the native `<dialog>` `cancel` event — `onCancel={e => { e.preventDefault(); requestClose(); }}` — with no explicit `window` keydown→Escape listener (same shape as `MobileNavigation` in `AdminChrome.tsx`, which QA already cleared in M-07).
- Live-verified in the browser (own tab, read-only, no saves):
  1. Opened "New sale", added an event counter on `window` keydown (capture) and on the dialog's `cancel` event, then pressed a real `Escape` via the `computer` tool's `key` action: `keydownCount:1`, `cancelCount:0`, dialog stayed `open:true` — reproducing the exact D-04/M-07 finding (synthetic/automated Escape reaches `window` but never triggers the native dialog's `cancel` path in this browser-automation environment).
  2. Manually dispatched a real `cancel` `Event` on the same `<dialog>` (bypassing the key-event layer, as M-07 did for the mobile drawer): the panel closed correctly (`open:false`, removed from DOM, `defaultPrevented:true` confirming the handler ran).
  3. Went further than M-07's check: typed into the phone-number field to mark the form dirty, then dispatched `cancel` again — this time the **"Discard changes?" confirmation dialog appeared** (`Keep editing`/`Discard changes`) instead of an immediate close, proving the dirty-form guard (`dirty.current`/`warnOnChanges`) also fires correctly on a real cancel, not just a bare close.
  4. Cleaned up via "Keep editing" → "Cancel" → "Discard changes" (no save, no status change).
- **Conclusion**: the app's Escape/cancel/dirty-guard handling in `Panel` is correct. The QA-observed failure is a genuine limitation of this browser-automation tool's synthetic Escape key, not an app bug. No code change made — none is warranted, and `Primitives.tsx` isn't in my ownership regardless.

## Gate counts

- `npx tsc --noEmit --incremental false`: **8 errors before, 8 after** (all in `scratch/*`, `src/app/(workspace)/admin/profile/page.tsx`, `AdminScreenContainer.tsx` — pre-existing per finding F1, none touched by me, no new errors).
- `npx eslint .`: **9 problems before (1 error, 8 warnings), 9 after** — all pre-existing in `scratch/ProductEditorContainer.tsx` and `src/app/(workspace)/admin/orders/page.tsx` (unowned), no new problems in any file I touched.

## Files changed

- `src/app/(workspace)/admin/tables.css` — lines 127, 145 (Q-04, Q-02)
- `src/app/(workspace)/admin/admin.css` — 1 line added inside existing `@media(max-width:767px)` block (Q-13)
- `src/features/admin/components/OrderDeliveryDetails.tsx` — added a `CSSProperties` import and one inline style (Q-02)

No changes to `OrderDetails.tsx`, `OrderTable.tsx`, `Sales.tsx`, `AdminChrome.tsx` were needed for my assigned bugs.

## Cross-agent requests

- **Q-09 (Sales outlet scoping)**: needs someone with license to touch `src/app/(workspace)/admin/sales/page.tsx` (and probably `orders/page.tsx`, `expenses/page.tsx` for consistency) to call `resolveOutletSelection()`, filter `listOrders`/`listExpenses` by `outletId`, and thread the result through `AdminScreenContainer` so a real `OutletSwitcher` can be rendered on those screens. This is a data/query change, not styling — flagging for the parent to scope as a follow-up rather than folding into this round.
- None regarding `ui/Dropdown.tsx` — `OrderTable.tsx`'s dropdown filters were not touched or exercised for misbehavior in this pass (my bugs didn't require using them); no complaint to relay to Agent A.
- None regarding `Primitives.tsx`/`onCancel` (Q-15) — confirmed correct, nothing to hand off.

## New things noticed (not fixed, flagging only)

- `.agents/CURRENT-STATE.md`'s "Multi-outlet W2" section is stale: it states Orders and Expenses (not just Dashboard) filter by `resolveOutletSelection`. Per current code, only the Dashboard page does. Worth a docs correction alongside whoever picks up the Q-09 follow-up.
- `tables.css:26`'s `.ad-detail-summary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}` (and the related mobile-narrowing rule at `tables.css:48`) appear to be entirely dead code — permanently overridden by the unconditional `display:flex` rule at `tables.css:127`, for every viewport width, since `tables.css` loads last in `src/app/layout.tsx`. Left as-is (not asked to remove dead code), but worth a cleanup pass since it makes the file harder to reason about (it reads as if there's a grid/flex breakpoint split that doesn't actually exist at runtime).
