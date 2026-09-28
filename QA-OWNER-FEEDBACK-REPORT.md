# Owner feedback QA report — 27 September 2026

**Decision: all 13 requested changes implemented; focused verification passed.** This report covers the supplied comments, not a certification of every application workflow. Earlier loading-state findings remain in QA-OWNER-UI-REPORT.md.

Environment: current working tree, Next.js 16.3.4, authenticated owner browser on localhost. Desktop 1456×853 and mobile 390×844. No new package, migration, live record deletion, live password change, or order submission.

| Comment | Result | Evidence |
|---|---|---|
| 1 | Delivery progress spans the detail panel width; compact facts and progress row replace the taller sidebar widget. | Desktop/mobile browser and geometry inspection. |
| 2 | Bill sits below progress with Service, Quantity, Rate and Amount columns, followed by total, received, balance and payments. Weight uses “Slab pricing” rather than an invented per-kg rate. | Existing paid order rendered in browser. |
| 3 | Status history is chronological with connected completed markers, a current marker, actor and IST timestamp. Actual recorded events are shown, including reversals. | Four real order events rendered; screenshot below. |
| 4–5 | Print, View PDF, Share, WhatsApp and Download move to the end of the order header. They render only when delivered and paid. PDF endpoints remain available. | Qualified existing order verified in browser; visibility condition source-reviewed; invoice settlement backend regression passes. Sharing/printing were not executed. |
| 6 | Shorter customer result stays on one line when space permits, with a two-line mobile cap. | Existing customer search; 390px and desktop measured one line. |
| 7 | Pieces/weight are validated text fields with numeric/decimal keyboards and no native spinner, wheel or arrow stepping. Fractional weight input retains its draft text. | Pieces typed as 3 and stayed 3 after ArrowUp; input type verified. Wheel prevention follows removal of number-input stepping; native wheel was not separately simulated. |
| 8–9 | Each desktop row and mobile card exposes View, Edit and Delete. Delete confirms the selected bill and shows busy/error states. Paid corrections update affected date/outlet totals transactionally. | View → prefilled edit and delete review opened, then cancelled; isolated DB correction/deletion tests pass. |
| 10 | Employees show Reset password on desktop and mobile, with a dedicated confirmed-password form. Owner-scoped action verifies employee membership, updates only credentials, revokes sessions and sets the existing password-change flag. | Owner dialog inspected without entering credentials; isolated test verifies password hash, revoked sessions, unchanged identity/outlets and cross-store/owner rejection. |
| 11 | Orders is removed from navigation. /admin/orders redirects to Sales while preserving query parameters. Owner order cache moves to Sales. Employees retain New sale and Sales register views there. Invoice URLs and order APIs are unchanged. | Old URL with order=EL-1 redirected to Sales and opened that order. Employee view wiring source-reviewed; no live employee login. |
| 12 | Filter controls have a common height and centered alignment; delivery pills no longer carry bottom margin inside the toolbar. | Desktop control geometry inspected. |
| 13 | Sales shows Outlet for a single outlet as well as multiple outlets, on table rows and mobile cards. | Existing sale shows its branch in both layouts. |

## Expense correction behavior

- Edit applies to the selected bill, preserving its paid date. Monthly bills stay in their original month; other occurrences and the recurring template stay unchanged.
- Delete is permanent after confirmation. For a monthly bill it stops future generation for that series, preserving other already-recorded bills. The confirmation explains this scope.
- Expense mutations and recurring generation share a store-level transaction lock. Repeated/concurrent deletion cannot subtract twice or regenerate the deleted bill.
- Paid edits/deletions recompute only affected date/outlet expense summaries from remaining bills, preserving other metrics and repairing missing legacy summaries.
- The added edit/delete and dedicated password-reset operations are web Server Actions; no new HTTP API contract was added.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed, zero errors; the same two existing unused-variable warnings in scripts/qa_audit.mjs remain.
- `LC_ALL=C npm run test:subscription-payments`: **82 passed**, against disposable local Postgres. Four added regressions cover expense corrections/deletion, recurring shutdown, legacy summaries, and password reset.
- `node --import tsx --test tests/client-cache.test.ts tests/payment-methods.test.ts`: **5 passed**.
- Isolated production webpack build: passed; active development .next output preserved.
- `git diff --check`: passed.

Browser exploration used read-only existing records and an unsaved sale draft that was discarded. Live expense deletion, live password reset, print/share delivery, authenticated employee rendering and throttled failure behavior were not exercised. Backend mutations were exercised in the isolated database suite.

## Screenshots

- [Sales filters and outlet column](qa-evidence/sales-register-aligned.png)
- [Order progress and bill](qa-evidence/order-detail-full-width.png)
- [Order timeline](qa-evidence/order-status-timeline.png)
- [Mobile order detail](qa-evidence/order-detail-mobile.png)
- [Mobile expense actions](qa-evidence/expense-actions-mobile.png)
- [Expense delete review](qa-evidence/expense-delete-review.png)
- [Password reset review](qa-evidence/employee-reset-password-review.png)
- [Mobile employee actions](qa-evidence/employee-actions-mobile.png)
- [Quantity field](qa-evidence/sale-quantity-fixed.png)
- [Mobile customer result](qa-evidence/sale-customer-note-mobile.png)

## Mobile follow-up — five comments (27 September 2026)

- New sale footer: equal-width Cancel and Save order controls, 48px minimum height, 16px gap at mobile widths. Measured at 430px: both 191px wide, gap 16px.
- Lookup results now say only `Existing Customer` and `New Customer`, sharing the compact status style.
- Order detail close control: 44px touch target aligned with the 44px title/status row; both top positions measured at 16px on mobile. Keyboard focus indication retained.
- Bill/invoice: compact table, 14px headings, 12–13px supporting text, tighter totals and payment history. Table keeps its accessible name without an extra visible caption.
- Payment form: 10px field gap, 44px input/button targets, compact heading/divider, amount and Pay balance aligned in one row.

Validation: TypeScript, targeted ESLint for both changed TSX files, and diff whitespace checks passed. Live 430×932 sale draft/customer lookup and paid invoice inspected. Unpaid form rendered from the actual OrderPaymentSummary component using an illustrative sample in a temporary localhost preview: 430×932 CSS viewport, no horizontal overflow, 14px headings, form approximately 238px high. No payment/order was submitted and drafts were discarded. Desktop header alignment also checked. Payment submission/backend behavior was unchanged and not rerun in this styling-only follow-up.

Evidence:
- `qa-evidence/sale-footer-mobile-refined.png`
- `qa-evidence/order-invoice-mobile-refined.png`
- `qa-evidence/order-payment-mobile-refined-sample.png` (illustrative sample)

## PDF, dialog loader and workspace density — 12 comments (27 September 2026)

1. **Invoice PDF:** reproduced the long address overlapping the invoice identifier and the misleading average rate on weight lines. Bounded shared header columns now wrap addresses, and weight rates say Slab pricing. The PDF toolbar's white-on-white Open link is readable. Styles/header, PDF response generation, browser preview, print and sharing each have one shared definition; customer-order and subscription business bodies remain separate. All four existing PDF endpoints use the same response helper with their existing authorization untouched.
2. **Whole-dialog loader:** Sales and retained OrdersClient use one mutation hook for payment/status actions. Panel covers header, body and footer with a spinner/status overlay, makes underlying content inert, blocks closing/repeated actions, and stays busy through action/refresh. Action acknowledgements update the cache; refreshed server snapshots supersede the temporary acknowledgement. Failure clears the overlay and shows the error.
3. **Profile:** organization name/address/contact first, current owner account separately, and named outlet cards with code/address/phone/status. Existing edit/security/payment controls retained.
4. **Shared footer:** removed extra container padding/minimum height. Compact footer follows the flex workspace shell; measured padding 0 and desktop height about 28.5px.
5. **Employees:** removed duplicate Team members heading; Add employee is beside Employees. Count/search/actions remain.
6. **Expenses header:** removed duplicate Bills & operational costs heading/subtitle and filter divider. Date filters and Add expense share a row on desktop and mobile; custom date bounds remain accessible beneath on mobile.
7. **Products:** reduced page/card padding and eliminated the doubled banner-to-card spacing.
8. **Dashboard footer:** uses the same compact shell/footer rather than mismatched fixed-height calculations.
9. **Mobile expenses:** 15px outer-card padding, 10px item padding, tighter component gaps; action buttons remain at least 44px tall.
10. **Mobile employees:** 15px outer-card padding and 10px employee-card padding; actions remain at least 44px tall.
11. **Mobile header:** menu/outlet/avatar all fit at 412px; long outlet labels truncate within their available width. Redundant mobile breadcrumb is hidden. No horizontal page overflow.
12. **Small mobile Sales:** register padding 15px; individual order cards 12px; removed duplicated heading/filter gap. Verified at 375×667 with no horizontal overflow.

### Validation and evidence

- `npx tsc --noEmit`, `npx eslint .`, `git diff --check`: pass. ESLint retains only the two pre-existing unused-variable warnings in scripts/qa_audit.mjs.
- Isolated production `npm run build -- --webpack`: pass on final source.
- `node --import tsx --test tests/invoice-share.test.ts`: 5 passing tests (PDF filename/MIME, HTML auth response rejection, cancellation, copied access URL, encoded WhatsApp fallback).
- Rendered the actual order/subscription templates through the shared response helper: PDF signatures, inline/attachment headers, private/no-store, expected amounts, Slab pricing, long-address geometry and footer bounds passed. A 70-line sample rendered over 4 pages with its last item and totals present; regular customer/subscription samples each rendered on one page. Inspected rendered page images and the live EL-3 invoice canvas.
- A temporary browser fixture using the actual Panel/useOrderMutation verified full overlay bounds equal to dialog bounds, inert header/body, Escape blocked while pending, success recovery and error recovery. Router refresh is stubbed in this fixture; live order/payment writes were not performed.
- Browser checks at 1456×853, 412×915 and 375×667 covered invoice/profile/products/expenses/employees/Sales/dashboard topbar and footer. No business records changed, no messages sent and no commits made. Native OS sharing/printing was not submitted. The in-app browser did not expose a reliable download event; PDF bytes/delivery headers were independently checked via the actual response helper.

Screenshots:
- qa-evidence/invoice-pdf-corrected-desktop.png
- qa-evidence/dialog-loader-sample.png (temporary sample)
- qa-evidence/profile-organized-desktop.png
- qa-evidence/profile-organized-mobile.png
- qa-evidence/expenses-header-compact-desktop.png
- qa-evidence/expenses-density-mobile.png
- qa-evidence/employees-density-mobile.png
- qa-evidence/products-density-desktop.png
- qa-evidence/dashboard-topbar-mobile-fixed.png
- qa-evidence/sales-register-density-small-mobile.png
