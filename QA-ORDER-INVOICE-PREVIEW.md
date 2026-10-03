# Owner order invoice preview

27 September 2026 local verification.

- Delivered and paid order details expose one outlined Invoice button beside Close. Existing eligibility is unchanged.
- Owner PDF now matches the Super Admin single-row desktop header: Invoice number, Print, Share, WhatsApp, Open, Download and Close. On mobile the actions wrap within the header. Shared print/share helpers and the existing PDF endpoint are reused.
- Four order-summary cards stretch to equal height with consistent label/value sizes and padding. Measured all four at 88.74px on desktop (1389px viewport), and all four at 74.74px on mobile (375px viewport).
- PDF fonts and document layouts are unchanged. Shared PdfPreview renders at scale 2–3, improving both viewers. Actual desktop canvas was 1191px for 900 CSS pixels; mobile canvas was 1191px for 309 CSS pixels.
- Live authenticated owner verification used R K Laundry EL-3 / INV-000002. Invoice opened and rendered successfully. Mobile document scroll width remained 375px, with no horizontal overflow.
- TypeScript, targeted ESLint and scoped diff checks pass. Super Admin controls were not edited; its authenticated browser preview was not repeated during this owner-session check.
- No order/payment changes, actual print jobs or outward sharing were submitted.

Evidence: qa-evidence/owner-order-equal-summary-cards.png, qa-evidence/owner-order-equal-summary-mobile.png, qa-evidence/owner-invoice-matched-header.png, qa-evidence/owner-invoice-matched-mobile.png.
