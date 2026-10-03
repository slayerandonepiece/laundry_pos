# Fix round: Agent A (Dropdowns)

Date: 2026-09-21. Scope: Q-03, Q-05, Q-12, plus the multi-select audit.
Nothing staged or committed.

Files changed:
- `src/features/admin/components/ui/Dropdown.tsx`: rewritten internals. The public API is unchanged, with additive props only.
- `src/features/admin/components/ui/OutletSwitcher.tsx`: now uses the shared hook. Props are unchanged.
- `src/features/admin/components/ExpenseEditor.tsx`: L131 adds `ariaLabel="Applies to"`; L140 and L158 add `minHeight: '40px'` to the checkbox labels.
- `src/app/(workspace)/admin/owner-workspace.css`: only `.switcher-*` (L26–97, L477–490) and `.dropdown-*` (L371–499) rules.

## Q-05: checkbox stacked above the label (fixed)
- **Root cause:** Two rules in `admin.css` win over the component's own rules:
  - `.ad-root label{flex-direction:column;font-weight:600}` has specificity 0,1,1. The component's `.dropdown-check-row` (0,1,0) never set a direction.
  - `.ad-root input{min-height:44px;padding:10px 12px}` made the checkbox 44px tall.
- **Fix:** Every row rule is now scoped as `.dropdown-menu .dropdown-check-row` (0,2,0) and `.dropdown-menu .dropdown-check-row input` (0,2,1). The rules set `flex-direction:row; justify-content:flex-start; font-weight:400`, a 16×16 input, `min-height:0` and `padding:0`. The "All" row stays 600, as a group header. `admin.css` was not touched.
- **Before (375, Employees → Add employee → Outlets):**
  - `flexDirection:"column"`, `fontWeight:600`, row height 85px.
  - The input was 15×44 and horizontally centred (x=99). The text sat below it (y=59).
- **After (375):**
  - `flexDirection:"row"`, `fontWeight:400` (the "All" row is 600).
  - Rows are 44px. The checkbox is at x=9 and the text at x=35.
  - The checkbox centre and the text centre are both at y=22, so they are vertically centred.
  - At 1440 the rows are 36px and in a row.

## Q-12: option rows under 40px on touch (fixed)
- `@media (pointer: coarse), (max-width: 767px)` sets `min-height:44px` on `.dropdown-check-row`, `.dropdown-radio-row` and `.switcher-option`. The footer Clear/Apply buttons get `min-height:40px`. The whole `<label>` or `<button>` row is the hit target.
- **Row heights, before → after:**
  - Multi-select rows: 85 → 44.
  - Status/Applies-to radio rows: 36 at desktop → 44 at 375.
  - Outlet switcher options: 37 → 44.
  - Footer buttons: 32 → 40.
  - Desktop (1440) rows stay compact at 36–37px.
- ExpenseEditor's "Repeat monthly" and "Already paid today" labels: 24 → 40px, using an inline min-height in the file I own. This is the part of M-08 that falls in my files. The global `.ad-checkbox` rule in `admin.css` still has no min-height, so the Profile "Show passwords" label is still 24px (see cross-agent requests).

## Q-03: outlet switcher overflows the right edge at 375 (fixed)
- **Root cause:** `.switcher-menu{position:absolute;left:0;min-width:230px}` has no right bound. `.dropdown-menu` had the same problem.
- **Fix:** The new shared `useDropdownMenu` hook positions the popup on open, in a `useLayoutEffect`:
  1. Left-align to the trigger.
  2. If that overflows, right-align to the trigger's right edge.
  3. Clamp to a 16px viewport gutter.
- CSS on both menus: `width:max-content; min-width:min(230px, 100vw-32px); max-width:calc(100vw - 32px)`. Options use `overflow-wrap:anywhere`.
- The trigger itself gets `max-width:100%`, `white-space:nowrap` and an ellipsis on the value.
- **Before (375):** the trigger wrapped to 55px tall. The menu spanned 191.7–421.7 against `innerWidth` 375, so it overflowed by 46.7px.
- **After (375):** the trigger is 37px. The menu spans 67–318 (width 251) and is right-aligned to the trigger's right edge at 318. All three options span 74–311 and are 44px tall. `scrollWidth` is 375.
- **Desktop (1440):** left-aligned, spanning 1037–1288. Long names no longer wrap (option heights 37/37/37; they were 37/55/37).
- **`.dropdown-menu` at 375:**
  - Employees multi-select: 58–321.
  - Expense "Applies to": 37–274.
- Inside the scrolling dialog body, the popup now calls `scrollIntoView({block:'nearest'})`. Hit-testing confirms the Clear and Apply buttons are reachable at 375.

## Multi-select audit and component behaviour
**Audit:** `graft grep` for MultiSelectDropdown and SingleSelectDropdown, plus grep for `type="checkbox"` and `<select` across `src/features/admin/`.
- Shared-component consumers:
  - `EmployeeEditor.tsx` (Multi; Agent B has already added `requireSelection`)
  - `OrderTable.tsx` OrdersClient (Multi and Single)
  - `ExpenseEditor.tsx` (Single)
  - `DashboardOutletControl.tsx` (OutletSwitcher)
- No hand-rolled multi-choice control exists anywhere in `src/features/admin/`. All remaining native `<select>`s are single-choice form fields:
  - `Sales.tsx`
  - `OrderDetails.tsx`
  - `OrderCart.tsx`
  - `OrderPaymentSummary.tsx`
  - `OrderEditorContainer.tsx`
  - `ProductEditorContainer.tsx`
  - `EmployeeEditor.tsx` "Default outlet"
  - `Primitives.tsx` DateFilter
  - `ExpenseEditor.tsx` "Category"
- The remaining checkboxes are lone booleans: ExpenseEditor "Repeat monthly" and "Already paid today", and Profile "Show passwords". Nothing needed replacing in `ExpenseEditor.tsx`.

**Component changes.** All three pickers now share `useDropdownMenu()`, which is exported from `Dropdown.tsx`:
- **Trigger summary** (Multi): "All outlets" when every option is ticked, the option's name when one is ticked, and "N outlets" otherwise.
  - When nothing is ticked it shows `emptyLabel`, a new optional prop. The default is "Select outlets".
  - Before, it showed "Outlets (0 of 2)".
- **ARIA:**
  - Every trigger has `aria-expanded` and `aria-controls` (while open), plus an `aria-label` of the form "Outlets: 2 outlets", "Outlet: All outlets" or "Applies to: Organization-wide".
  - Multi uses `aria-haspopup="dialog"` and a popup with `role="dialog"` and `aria-label`. The options are native checkboxes with label text as their names. Before, `role="listbox"` wrapped `<label>`s, which is invalid.
  - Single and the switcher use `role="listbox"`. Each option is a focusable `<button role="option" aria-selected>`; Single's options were non-focusable `<div>`s before.
  - Decorative icons, carets and ✓ marks are `aria-hidden`.
- **Keyboard:**
  - ArrowDown or ArrowUp on the trigger opens the popup. Enter and Space open it natively, since the trigger is a button. Opening moves focus to the selected option, or the first one.
  - Arrow keys, Home and End move between options.
  - Enter on a checkbox toggles it instead of submitting the surrounding form (verified with a real Enter keypress; the dialog stayed open).
  - Escape closes the popup, returns focus to the trigger, and stops propagation, so an enclosing `Dialog` does not close. Verified in Add expense: the popup closed, the dialog stayed open and focus returned to the trigger.
  - Tab is not trapped. Focus moving outside the wrapper closes the popup: real Tab keypresses walk through Checkbox → Clear → Apply, and focus moving to a text field closed it.
- **Close rules:**
  - A pointer-down outside closes the popup (`pointerdown`, so touch works too).
  - Opening any picker closes every other one, through a window event. Verified on Orders: open the outlets popup, then open the status popup, by pointer and by keyboard. Result: `aria-expanded` false/true, and one menu in the DOM.
- **"All" semantics (Multi):**
  - Ticking every option individually ticks "All", and the trigger reads "All outlets".
  - "All" is indeterminate when some options are ticked. Unticking "All" empties the draft explicitly.
  - The `onChange` output is filtered to values that are known options.
  - New `requireSelection` prop: disables Apply and shows "Select at least one." when nothing is ticked.
- **Footer (same for every consumer):**
  - Clear empties the draft and is disabled when the draft is already empty. It no longer applies-and-closes on its own.
  - Apply commits and returns focus to the trigger.
  - Escape or an outside click discards the draft.
  - The inline button styles moved to CSS.
- **SingleSelectDropdown:** new optional `ariaLabel` prop. Choosing an option closes the popup and returns focus to the trigger.
- Visible focus ring on options is inset (`outline-offset:-2px`), so the scrolling popup does not clip it.

**Browser automation caveats:**
- The background tab has `document.hasFocus()=false`, so programmatic `.focus()` fires no focusout. I verified focus-leave behaviour with real key presses instead.
- The tool's `key: "space"` delivers `key:""`, so it could not test Space on a checkbox. That toggle is native checkbox behaviour, and it was exercised with real clicks.

**How I tested:** own tab (`tab-4`), no saves, no Log out, and every dialog was closed with Cancel → Discard. Pages covered:
- Dashboard switcher at 1440 and 375
- Employees → Add employee at 375
- Orders filters at 1440
- Expenses → Add expense at 1440 and 375

## Gates
- `npx tsc --noEmit --incremental false`: 8 errors before and 8 after, all pre-existing (scratch/, profile/page.tsx, AdminScreenContainer.tsx). None in my files.
- `npx eslint .`: 9 problems (1 error, 8 warnings) before and after, all pre-existing (scratch/, orders/page.tsx). My three files lint clean.

## Cross-agent requests
- **Agent C, `OrderTable.tsx` OrdersClient:**
  - An empty outlet selection there means "no filter". Pass `emptyLabel="All outlets"` to `MultiSelectDropdown`. Without it, the idle trigger reads "Select outlets".
  - Separate bug: `outletOptions` is built from `storeOptions` (`value: s.storeId`, label = store name), but the filter compares against `o.outletId` (L135 vs L146). As a result the "outlet" filter lists stores, and any selection hides every outlet-owned order.
- **Agent C, `Sales.tsx`:** the work-status and payment-status filters are native `<select>`s, while the equivalent filters on Orders use `SingleSelectDropdown`. They should use the shared component for consistency; `ariaLabel` is available to keep the current accessible names.
- **Agent B, `EmployeeEditor.tsx`:** `requireSelection` has already been adopted. Optional: the "Active outlets" `<label>` isn't linked to the trigger. The component's `aria-label` ("Outlets: …") covers it, so nothing is required.
- **Agent D, `Profile.tsx`, and whoever owns `admin.css`:** the "Show passwords" `.ad-checkbox` label is still 24px (M-08). The clean fix is `min-height:40px` on the global `.ad-checkbox` rule in `admin.css`, which I don't own.
- **`DashboardOutletControl.tsx`** (unowned): it wraps the switcher in a `<fieldset>` that has browser-default border and padding. It looked fine in testing; this is noted only.

## New findings (not fixed)
- `src/features/admin/components/StoreSwitcher.tsx` (rendered from `AdminChrome.tsx`) is a second, hand-rolled switcher with its own `.ad-store-switcher-*` CSS in `admin.css` L223–232. It has no keyboard navigation, no Escape handling and no viewport clamping. It is a duplicate of `OutletSwitcher`. Retire it, or move it onto `useDropdownMenu`, in a later round.
