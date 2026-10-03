# Sale flow + Bill/Invoice redesign — task sheet

Started 2026-09-22. Owner decisions (from chat):
- Invoice replaces Bill only when the order is **paid in full AND delivered**
  (matches `getOrCreateOrderInvoice`'s server gate — no backend change).
- Bill is **on-screen only** for now (no bill PDF / customer link).
- Owner with **more than one active outlet** must pick the outlet on New sale;
  no default pre-selected. Employees / single-outlet stores unchanged.

Already fixed by parent (uncommitted, do not redo):
- `orders.actions.ts`: status/payment guard looked up `id: orderCode`
  (never matched `EL-n`) → now `orderNumber: parseOrderCode(...)`; owners
  exempt from the selected-outlet guard.
- Dropdown/OutletSwitcher text caret `▾` → SVG chevron.

## Lanes (file ownership — edit only your files; use Edit with narrow
## old_strings, never Write over a shared file)

### Lane A — Order details (Bill/Invoice) · status: DONE
Summary: `OrderPaymentSummary.tsx` now renders one card titled "Bill" (unpaid/
partial or not-yet-Delivered) or "Invoice" (paid in full && Delivered), each
with a compact service/qty/rate/amount breakdown, order total/received/balance,
and payments-received list; `OrderInvoiceActions` only renders inside the
Invoice card (removed the old unconditional render from `OrderDetails.tsx`).
The record-payment form is keyed on `order.payments.length` so it clears after
a successful payment. `AdminScreenContainer.updateStatus`'s confirmation now
names the exact balance due and swaps the confirm label to "Deliver anyway"
when marking Delivered with money still owed. Mobile header (`OrderDetailsHeader`
via `.ad-details-header`) is a compact 2-column grid under 767px, scoped with
`.ad-root .ad-details-header` in `admin.css` so it outranks tables.css's
existing 1-column mobile rule without editing that file. `tsc`/`lint` stayed
at the pre-existing 8/9 baseline.
Owns: `OrderDetails.tsx`, `OrderPaymentSummary.tsx`, `OrderDetailsHeader.tsx`,
`OrderInvoiceActions.tsx`, `src/app/(workspace)/admin/admin.css`.
Shared (narrow edit only): `AdminScreenContainer.tsx` → `updateStatus` confirm copy.
- A1 Bill card when not (paid in full && Delivered): line items qty × rate =
  amount, order total, received, balance due, record-payment form inside.
- A2 Invoice card when paid+delivered: same breakdown + invoice buttons.
  Invoice buttons never render otherwise.
- A3 Record-payment form resets after a successful payment.
- A4 Marking Delivered with balance due → confirmation states the amount due.
- A5 Mobile: compact header (customer / delivery / total in one block).

### Lane B — New sale form · status: DONE (awaiting parent browser check)
Owns: `OrderEditorContainer.tsx`, `orders.actions.ts` (createOrderAction only),
`src/app/(workspace)/admin/sales/page.tsx`, `owner-workspace.css` (append a
`/* new-sale form */` block).
Shared (narrow edit only): `AdminScreenContainer.tsx` → the `OrderEditorContainer`
render line + prop plumbing for outlets.
- B1 Outlet picker (required, no default) for owners with >1 active outlet;
  server validates the chosen outlet via `requireOutletSession`.
- B2 Expected delivery defaults to today + 2 days (min today).
- B3 "Paid in full" button; payment method shown only when received > 0.
- B4 Rate per line (₹x / pc, slab/kg for weight).
- B5 Footer: Subtotal · Received now · Balance.
- B6 Service picker → shared `SingleSelectDropdown` (ui/Dropdown.tsx).
- Done: sales/page.tsx passes owners' ACTIVE outlets as `serverOutlets`;
  OrderEditorContainer shows a required Outlet dropdown (no default) only when
  >1 active outlet and sends it as `createOrderAction(input, outletId)`. Server:
  given outletId → `requireOutletSession` validates it; none given → OWNER with
  >1 allowed outlet is rejected ("Choose an outlet for this order."), otherwise
  the cookie/default fallback (employees unchanged). Delivery defaults to
  today+2 (IST), controlled Received now + "Paid in full", method only when
  received > 0, per-line "₹x / pc" rate, footer Subtotal/Received/Balance,
  service picker = SingleSelectDropdown (already-chosen services filtered out).
  CSS: `/* new-sale form */` block in owner-workspace.css. tsc 8 / lint 9 (baseline).

### Parent — verification · status: DONE (2026-09-22)
Browser-verified desktop + 375px: EL-4 created at HSR Layout (non-default
outlet honoured; save blocked until outlet chosen), Paid in full, Bill while
undelivered → Invoice after Delivered, INV PDF 200. EL-3 part-paid → Deliver
warning shows balance; payment clears form. Parent fixes found in verify:
Bill breakdown table → compact lines (`.ad-bill-lines`); Orders page
(`OrderTable.tsx`) had its own status handler without the balance warning, and
kept a stale order snapshot after refresh (now derives the open order from
`serverOrders` by id). tsc 8 / eslint 9 (baseline). Nothing committed.
