# Tailwind / Design Sync — owner and employee workspace audit

## Coordination note

The requested sync file was not present in the repository, so this file is being created before implementation. This audit is limited to visual/UX changes under the owner/employee workspace, unified login styling, and public marketing CSS. No server code, actions, submit/session logic, or data flow will be changed.

## Artifact rules used

- Foundations: `#0758d6` brand, `#064bbb` pressed, `#eef3ff` selected tint, `#102039` ink, `#5b6879` secondary text, `#e4e8ee` borders, white page surfaces, and cream only for inset/table-header surfaces.
- Foundations typography: Manrope for page titles/display names; DM Sans for interface text; IBM Plex Mono for money, codes, invoice numbers, and IDs.
- Foundations interaction: selected navigation/tabs/filter states use color plus a second signal; disabled controls explain why; dates include the year; tabular money/codes align right.

## Audit and planned fixes — posted before edits

### 1. Owner/employee shell and navigation

- `src/app/(workspace)/admin/admin.css`, `AdminChrome.tsx`: the active sidebar item currently uses only blue text plus a background tint, and inactive text includes the disallowed low-contrast `#68758a`. Fix with the artifact pattern: reserve a 3px left border, add the brand left bar and bold weight to `.active`, and use `#5b6879` for inactive text. Align shell borders, controls, and surfaces to the Foundations tokens.
- `admin.css`: the workspace still carries legacy navy/cream and scattered hard-coded border/text colors. Fix only the shared custom properties and selectors so Dashboard, Sales, Orders, Expenses, Employees, Profile, and POS inherit the same v2 language without rewriting their markup.
- `admin.css`: money and numeric KPI/table values use tabular numerals inconsistently. Fix shared numeric selectors and right-align list amounts where the existing markup already exposes `.ad-number`, metric totals, chart totals, and receipt totals.

### 2. Dashboard

- `src/features/admin/components/Dashboard.tsx`, `DashboardCharts.tsx`: dashboard metrics and chart values should follow Foundations money/numeric treatment; fix through shared classes/tokens and keep the existing data presentation.
- Match artifact Dashboard cards: white cards, `#e4e8ee` borders, restrained radius, Manrope display values, DM Sans labels, and brand only for primary emphasis.

### 3. Sales, Orders, and POS / Counter

- `Sales.tsx`, `OrderTable.tsx`, `OrderDetails*`, `OrderCart.tsx`, `ServiceGrid.tsx`, `QuantityForm.tsx`, `EmployeeSalesContainer.tsx`, plus `tables.css`, `counter.css`, and `pos.css`: money is already partly tabular but order IDs/codes and several amounts are not consistently IBM Plex Mono/right-aligned. Add narrowly scoped semantic classes where needed and shared CSS rules; preserve existing interaction/data flow.
- `admin.data.ts`: `dateLabel` omits the year while `OrderTable` and order detail surfaces use it. Fix the shared formatter to include `year: 'numeric'`, so every owner/employee order date matches the artifact date rule.
- POS disabled controls such as unavailable quantity/order actions need an adjacent explanation. Add/adjust existing helper copy only where a disabled state is currently unexplained; do not change validation or submit behavior.
- Tabs/filter/selected product states in existing POS/order surfaces must retain a non-color signal. Fix active borders/weights/underlines in the shared CSS.

### 4. Expenses

- `Expenses.tsx`, `ExpenseEditor.tsx`: align amount columns and editor totals to right-aligned tabular money, and normalize card/table tokens through `admin.css`/`tables.css`.
- Audit disabled payment/action controls for adjacent reason copy; preserve existing action handlers.

### 5. Employees, Profile, and catalogue/settings

- `Employees.tsx`, `EmployeeEditor.tsx`, `Profile.tsx`, `Catalogue.tsx`, `PaymentMethodsSettings.tsx`: IDs, prices, and payment amounts should use IBM Plex Mono/tabular alignment; status/active selections need a second visual signal; shared controls should use v2 borders, radii, and secondary text.
- For disabled add/remove/settings controls, expose the reason with existing help/error text or add a short adjacent hint without touching actions.

### 6. Unified login

- `src/features/admin/components/Login.tsx` and legacy login selectors in `admin.css`: styling/markup only. Replace the legacy visual weight with a white v2 gate using the same brand, type, field, error, focus, and busy-state language as the artifact. Preserve the unified `/login` role behavior, submit logic, session handling, and redirects exactly.

### 7. Public marketing site — lower priority

- `src/app/globals.css` and consuming public pages currently use a separate marketing palette, typography scale, and cream/deep-blue section treatment. This is intentionally lower priority and will be noted rather than allowed to block the owner/admin sync. Only make low-risk shared token/typography corrections if they do not disrupt the marketing composition.

## Verification checklist

- [ ] `npx tsc --noEmit`
- [ ] `npx eslint .`
- [ ] 43/43 tests green (record the actual repository test command/result)
- [ ] Screenshot or browser review of `/login`, dashboard, orders, expenses, employees, profile, and POS at desktop/mobile where tooling is available.
- [ ] Record each completed change with its artifact screen/rule above.

## Implementation log

- Done — Foundations / navigation rule: `admin.css` now uses the approved secondary text token, reserves a 3px active-nav border, and combines selected fill + left bar + bold weight.
- Done — Foundations / money and IDs rule: shared owner-side numeric surfaces use IBM Plex Mono with tabular numerals; `.ad-number` amounts are right-aligned.
- Done — Foundations / dates rule: `admin.data.ts::dateLabel` now includes day, month, and year. This fixes Orders and order-detail consumers that use the shared formatter.
- Done — Foundations / cards and tables: shared admin table headers now use the approved cream inset and border tokens.
- Done — Unified login: styling-only token/typography/surface sync in `admin.css`; `Login.tsx` submit logic, session handling, role routing, and unified-login behavior were not changed.
- Done — Components / disabled-control rule: payment-method updates now show “Updating methods…” while temporarily disabled, and recording payment explains when no store payment method is enabled. Action handlers and data flow are unchanged.
- Reviewed / public marketing site: `globals.css` intentionally remains composition-specific (marketing deep-blue/cream sections). No low-risk token migration was made because it would alter the public art direction rather than close an owner-workspace inconsistency.
- Open follow-up: the repository currently exposes 9 test files and no test script; `npx vitest run` did not complete in the available environment, so the requested “43/43” gate could not be verified from this checkout. Disabled-control copy should receive a separate component-by-component pass where existing explanatory help is absent.
