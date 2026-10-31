# Mobile alignment: web changes of 2026-10-06 (working tree, uncommitted)

Hand-off for the Flutter (KlenPOS) frontend agent. Everything below is already built in the
Next.js web workspace. Check the mobile app against each item, change what differs, and report
what you changed and what you could not do. The web code is the reference; the HTTP contract is
`.agents/MOBILE-API-CONTRACT.md`. Do not edit the web repo's behaviour; if mobile needs a new
endpoint, list it under "Backend gaps" instead of inventing one.

## Prompt to give the agent

> You are working on the KlenPOS Flutter app. The web workspace changed (see
> `.agents/MOBILE-ALIGNMENT-2026-10-06.md` in the Next.js repo, and `.agents/CURRENT-STATE.md`
> sections "Profile split into sections", "Sales, order details and Orders counter polish" and
> "Sales register: server-side filters and paging"). For each numbered item below, find the
> matching mobile screen, say whether it already matches, and change it if not. Keep the app's
> own design language (do not copy web CSS); match behaviour, wording and information. Use only
> endpoints that exist in `MOBILE-API-CONTRACT.md`. Finish with: a per-item table (matches /
> changed / blocked), files touched, tests or checks run, and any backend gap.

## 1. Profile screen: group into sections

Web `/admin/profile` is now five sections (tab bar). Employees see only the first.

| Section | Contents | Roles |
| --- | --- | --- |
| My account | Avatar, name, role, organization, login phone, Log out; Security (last password change, Change password) | owner, employee |
| Organization | Name, contact phone, email, address (Edit); outlets list as cards (name, status, outlet code, address, phone); Delete organization as a separate, red-bordered danger card | owner |
| Billing | Status tile, plan (annual fee, deposit), current term start, paid-through date; invoices and receipts list | owner |
| Payment methods | Read-only table, see item 3 | owner |
| Customer messages | Read-only, see item 4 | owner |

Mobile: use whatever fits the app (segmented control, sub-screens from a Profile list). Owner-only
sections must not appear for employees. Sources: `GET /profile`, `GET /memberships`,
`GET /payment-methods`, `GET /subscription/invoices`.

## 2. Billing and invoices (owner)

- Status label from payment state: Active, Renewal due soon, Expired, Awaiting payment, Free trial,
  Trial ending soon. On a trial show "Trial period / Ends <date>" instead of a term start.
- Term start = start of the paid period that ends last; end = paid-through date.
- Invoice rows: invoice number (`INV-000001` style, zero-padded 6 digits), For (Deposit / Annual
  renewal), billing period `<from> – <to>` or "One-time" for the deposit, paid on, method (Cash,
  UPI, or "—"), amount. Newest first. Empty state: "No invoices yet. They appear here once a
  payment is recorded for your organization."
- Row actions: View, Download. View opens an in-app preview, not a download. Dates are shown with
  the year (for example 26 Sept 2026).
- `GET /subscription/invoices/{seq}/pdf` works with the bearer token; use it for View, Download and
  Print. Another organization's invoice is a 404.

## 3. Payment methods: say what the stage means

Web no longer shows "Both". It shows two columns per enabled method:

- **When placing an order**: offered on the new-order screen (customer pays up front or chooses to
  pay on delivery).
- **After the order**: offered when recording a payment on an existing order, or collecting the
  balance at delivery.

Rules (same as the server): stage PRE_ORDER = first column only, POST_ORDER = second only, BOTH =
both. Cash on delivery (`COD`) is never offered after the order, even if an old row says BOTH,
because it is a promise to pay, not money received, and recording it is rejected server-side. Help
text on web: "Contact support to change which methods are offered." Owners cannot edit methods.
Check that the mobile new-order, Record payment and Deliver screens already filter by stage this
way.

## 4. Customer messages: show state and a preview

Per status (Order placed, In progress, Ready, Delivered): title, when it is sent, On/Off badge,
a chat-bubble preview, the attachment (None, Order slip PDF, Invoice PDF) or "Not offered to staff
while off", and the raw template on demand. Header line: "N of 4 messages are on. When an order
reaches an 'on' status, staff see a Share update button that fills in the message." The preview
fills placeholders with sample values: customer Ravi, store One Wash Laundry, outlet
Chinnapanahalli, order 1000004314, total 420, due 210, date 14 Aug 2026, due date 16 Aug 2026,
method UPI, invoice IN001/27/0000632, link example.com/i/Xk2Q9. Unknown placeholders stay as
written. There is no mobile endpoint that lists the organization's templates yet (see gaps).
`GET /orders/{code}/message` already returns the filled text for a real order.

## 5. Sharing invoices and links

- One invoice viewer everywhere on web: Print, Share, WhatsApp, Open, Download. Mobile should offer
  at least Share (system share sheet with the PDF file), Download and Print, and WhatsApp where the
  app already has a WhatsApp action.
- **Customer invoices and order slips are shared only as opaque links**: `/i/<token>` (PDF),
  `/i/<token>/view` (preview page), `/o/<token>` and `/o/<token>/view`. Tokens are random, never
  derived from the order or invoice number. Never put an order number, invoice number or phone in a
  shared URL; use `invoice.accessToken` from the order detail endpoint.
- **Owner subscription invoices**: web shares `/s/<token>`, where the token is the invoice number
  encrypted on the server. Mobile has no way to mint that yet (see gaps), so for now share the PDF
  file itself (fetch with the bearer token, hand the bytes to the share sheet). Do not build a link
  from the invoice number.

## 6. Sales list defaults

- Default period is **This week** (was This quarter). Periods: This week, This month, This quarter,
  Custom dates; custom dates load only after Apply.
- The chosen period may be remembered while the user stays signed in, but must be cleared on
  logout (web deletes its cookie on logout). A fresh sign-in always starts at This week. Check that
  mobile does not persist the period across logout or account switch.
- Header: date range control and New order button are separated and aligned (button right,
  flush with the list edge). On phones both are full width, stacked.

## 7. Earlier uncommitted web changes to verify on mobile (2026-10-05 and 06)

Read the sections named in `.agents/CURRENT-STATE.md`, then check each against mobile.

- **Orders counter is two steps**: pick services, then a "Review and pay" step (items with rate and
  amounts, total, received, balance due; delivery, payment method chips, received with a Full
  shortcut, notes; Back and Place order). Proceed is disabled with no services.
- **Payment gating on delivery**: Delivered is terminal and refused while a balance is due; use
  `POST /orders/{code}/deliver` to collect the balance and deliver in one step. Status can only move
  forward. Owner-only cancel before delivery needs a reason (3 to 500 characters).
- **Share update**: link only, no PDF attached on web; appends the public link when the template has
  no `{link}`.
- **Sales server-side filters and paging**: period, search (name, phone, code), work status,
  payment status, Due today, Late, page size 10/25/50/100.
- **Organization methods and templates are Super Admin only**: owners and employees cannot edit
  them; mobile `PATCH /payment-methods/{id}` is 403.
- **Imported orders** appear in history marked `imported`, have no invoice or Share button.

## Backend gaps (not built; do not work around in the app)

1. No mobile endpoint for an organization's message templates (needed for item 4).
2. No mobile endpoint that returns the encrypted `/s/<token>` link for a subscription invoice
   (needed to share it as a link; web uses a server action).
3. The invoice list has no "billing term start" field; mobile derives it from the invoices as web
   does.

## Verification notes (what web has and has not checked)

Web was verified as owner at desktop width and, for Sales, at 900px. Not verified on web: phone
width for the new Profile pages, the employee redirect from owner-only sections, and the order
invoice dialog after it was refactored onto the shared viewer.
