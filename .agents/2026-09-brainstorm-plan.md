# 2026-09 feature brainstorm — decision record and build plan

This file is the single source of truth for a batch of decisions made in a
2026-09-09 brainstorming conversation with the project owner, covering seven
independent-but-related features. Every sub-agent working on any item below
must read this whole file before writing any code — do not re-derive or
guess at scope; every open question below was already asked and answered by
the owner. If something genuinely isn't covered here, stop and ask rather
than assume.

Read `.agents/README.md`, `.agents/CURRENT-STATE.md`, and `.agents/BACKEND-PLAN.md`
first, as with any change to this repo. This file adds to them; it doesn't
replace them.

**Explicitly out of scope — do not build, do not touch:**
- `StoreAuditEvent` / audit trail for lock/unlock/edit/delete/plan-change
  actions. Store Detail's Activity tab and Plan Detail's "Change history"
  stay stubs.
- GST/tax on any invoice (subscription billing or the new customer invoice
  below). The business is cash-only and not GST-registered yet. No tax
  columns, no HSN/SAC, no GSTIN, anywhere. This becomes mandatory later but
  is explicitly not now — don't pre-build a schema for it on a guess.

**Update `CURRENT-STATE.md` as part of whichever item you implement**,
following its existing style (what shipped, how it was verified, what's
still open) — same convention used for every other feature in this repo.

---

## Item 1 — Employee access becomes per-store, not per-user

**Problem today:** `User.active` is one global boolean, and
`requireStoreSession()`'s `onlyMembership()` helper refuses to resolve a
session at all for anyone with more than one `StoreMembership` — so today,
deactivating an employee anywhere deactivates them everywhere, and a person
literally cannot be a member of two stores and log in.

**Decision:** an employee can move between stores over time (Store A → Store
B), using the *same* login credentials throughout. Deactivating them at
Store A must not affect Store B. Concretely:
- Employees are constrained to **exactly one active store membership at a
  time** — this is enforced by policy/business process (a store's own owner
  manages their own employees), not by making it technically impossible to
  have two `StoreMembership` rows; a person could technically have a stale
  inactive membership at their old store while active at a new one.
- Employees never work at two stores *simultaneously* — sequential only.
  There is no employee-side store switcher; a logged-in employee never sees
  a choice, only their one active store's login goes anywhere. (Contrast
  with owners — see Item 2.)
- Moving a person's active flag doesn't touch their password or
  `credentialVersion` — same credentials the whole time, only their
  store-level access changes.
- Deactivating at one store must not kill sessions at other stores where
  they're still active — this is a materially different guarantee than
  today's global `revokeAllSessionsForUser()` behavior, which must become
  store-scoped for this case (find the actual mechanism — likely: sessions
  need to record which store they're scoped to, or `requireStoreSession()`
  needs to check per-membership active state live rather than relying on a
  global session-kill).
- No "branch" concept — a store is a store, no parent/child hierarchy. An
  owner with multiple stores continues to be billed for each store
  separately, exactly as today. Don't introduce any store hierarchy.

**This item shares `requireStoreSession()` with Item 3 below — do both in
the same pass, not as separate concurrent changes**, since they touch the
same function and both change what "can this session access this store"
means.

## Item 2 — Owner multi-store dashboard + switcher

**Depends on Item 1** (an owner needs multiple genuinely *active*
memberships to switch between, which today's `onlyMembership()` block
prevents entirely).

**Decision, precisely:**
- A **persistent store selector in the store workspace's header** (not just
  Super Admin) — visible only when the owner actually has more than one
  store; if they have exactly one, no selector, straight to that store's
  data, no picker shown at all.
- Default selection on first load (no prior choice remembered yet):
  **auto-pick one store** (e.g. their first/oldest) — never block the owner
  with a forced "choose a store" empty state. They can change it via the
  header any time; the choice should persist across reloads.
- **Only the Dashboard screen ever aggregates across "All stores."** Every
  other screen — Products, Sales/Orders, Expenses, Employees — always
  requires one specific store selected, exactly like today's single-store
  behavior once a store is chosen. There is no merged/combined list view
  anywhere outside Dashboard (no "all products across all my stores" table,
  no "all employees across all my stores" table). When the owner has
  multiple stores, the header selector for these screens should let them
  search/pick a specific store (a searchable dropdown, not a giant plain
  `<select>`, in case an owner eventually has many stores), and only then
  does that screen's data load.
- Dashboard's "All stores" option sums/aggregates the same metrics the
  single-store Dashboard already shows, across every store the owner is an
  active member of.
- **Super Admin needs no changes for this** — it already loads everything
  and lets the platform admin filter locally; that's correct as-is.
- **Employees never see this selector** — single-store access only, no
  ambiguity, nothing to switch.

## Item 3 — Payment-lapse access enforcement + warning banners

**Decision:**
- This is a **computed** check, not a stored lock flag. Do not set
  `Store.status = 'LOCKED'` when a subscription lapses — check
  `paidThroughDate < today` live in `requireStoreSession()`, the same place
  the existing explicit-admin-lock check already lives (share the
  mechanism, keep the *reasons* distinguishable — an admin lock and a
  payment lapse are different causes of the same outward "access withheld"
  effect, and should probably say different things to the user, but neither
  should require a manual "unlock" step for the payment-lapse case).
- Because it's computed, access must resume **automatically**, with no
  extra action, the instant a renewal payment is recorded and
  `paidThroughDate` moves forward — no "reactivate" step for payment lapse.
- **7 days before `paidThroughDate`:** show a warning banner in the store
  workspace. Full detail (exact expiry date, presumably a way to know who to
  contact) shown **to the owner**. Employees should see a much more generic
  message — something like "billing is due, please check with your store
  owner" — no financial specifics exposed to staff.
- **Once `paidThroughDate` has passed:** instead of the normal
  dashboard/screens, the owner and employees see a blocking "plan expired,
  please renew to continue" screen — reuse the existing locked-store screen
  pattern/component, adjusted messaging, rather than building a second
  separate screen from scratch.
- **No changes needed on the Super Admin side** — Stores/Billing already has
  "Expiring" filters and badges; that's sufficient per the owner's own call.

## Item 4 — Simplify Change Plan (drop the fake "Immediately" option)

**Why:** plans are standard, one year at a time, and don't change mid-term
in real usage. The only real-world scenario is renewing early (a month or
so before the current term ends), and the *existing* renewal-payment logic
already handles that correctly (extends from whichever is later — today, or
the current `paidThroughDate` — so renewing early never shortens or
overlaps a term). There is no real proration need to design around.

**Decision:** remove the "Effective from: Next renewal / Immediately"
choice from `ChangePlanDialog.tsx` entirely, including the disabled
"Immediately, recalculating the current term's balance — not built yet"
option and its explanatory copy. "Change plan" becomes purely an update to
the terms on file going forward (deposit/fee/which plan) with **zero**
effect on the current `paidThroughDate` — no user-facing choice to make
about timing at all. Keep the "Reason" field (still useful, still appended
to `Subscription.notes`) and the card-based plan picker — only the
effective-from framing goes away.

## Item 5 — "Collected this year" (financial-year revenue aggregate)

**Decision:** use **financial year** (April 1 – March 31), not calendar
year — the owner's own reasoning was "better for auditing," consistent with
Indian FY conventions. Build the aggregate query against
`SubscriptionPayment` scoped to the current FY window (compute FY boundaries
from `todayIST()`, matching how the rest of this app already treats "today"
as an IST calendar date). Surface it on the Subscriptions → Billing by store
screen (P2), matching the design canvas's original "Collected this year"
stat card with a year-over-year delta if that's cheaply derivable (previous
FY's same aggregate) — don't force the delta if it adds real complexity,
flag it back if so.

Also build, same pass (both were approved together): **payment reference
numbers** (a field on `SubscriptionPayment` for a UPI transaction ID etc.,
free text, optional), **"recorded by" attribution** (which Super Admin was
logged in when they hit Record Payment — capture `superAdminId`/actor on
`SubscriptionPayment`, surface on the invoice detail), and **owner
email/phone display** — note `User` currently has neither column; decide
whether to add them there (global to the person) or keep them
Store-specific (the `Store` model already has its own `email`/`phone`,
which represents the *store's* contact info, not the owner's personal
one — these are different things; don't conflate them).

## Item 6 — WhatsApp share option on the subscription invoice

**Decision:** no real email sending (still needs an email-provider decision
the owner hasn't made). Instead, add an explicit **WhatsApp** share path
alongside the existing Print/View/Download buttons on the invoice detail
page (`InvoiceActions.tsx`):
- Desktop: open WhatsApp Web (or the WhatsApp desktop app if the OS handles
  the protocol) via a `wa.me` / `api.whatsapp.com/send` deep link, prefilled
  with a message containing the invoice's view link. WhatsApp Web cannot
  accept an attached file via a URL scheme — link-only is correct here, not
  a limitation to work around.
- Mobile: the existing native OS share sheet (already built, via
  `navigator.share`) already lets a user pick WhatsApp specifically and, when
  file-sharing is supported, hands over the actual PDF bytes — that path is
  correct as-is; this item is specifically about giving desktop users an
  explicit, guaranteed WhatsApp option that doesn't depend on
  `navigator.share` existing (many desktop browsers don't implement it at
  all).
- **Reconfirmed constraint: PDFs are never stored.** Every share/view/download
  path must keep constructing the PDF on-demand from live data at request
  time and streaming it straight to the response — this was already true of
  the existing implementation and must stay true here; don't introduce any
  persisted PDF file or cache.

## Item 7 — New: customer-facing order invoice (separate from subscription billing)

**This is two genuinely separate invoice systems — do not conflate them or
their numbering:**
1. Platform → store owner (subscription billing) — already exists,
   `SubscriptionPayment.invoiceSeq`, unaffected by this item.
2. Store → customer (a laundry order's bill) — **does not exist yet**.
   Today an order only has `Order.orderNumber` (→ `EL-<n>`, an internal
   job/tracking number) with no formal invoice document at all.

**Decision on the new customer invoice:**
- **Global invoice number sequence** (one counter across the whole
  platform, same pattern as everything else in this app — not per-store,
  despite per-store being more typical for small shops; consistency with
  the rest of the codebase won over that). Display format should match the
  existing convention already used for subscription invoices:
  `INV-000123` (zero-padded).
- The invoice record carries: the global invoice number, `storeId`, the
  **customer's phone number** as their identifier (no new Customer entity —
  see below), the order number it's for, and date/time.
- **No Customer directory/entity.** Customer data stays exactly as
  unstructured/per-order as it is today (`customerName` + `phone` typed per
  order) — no cross-store or even cross-order customer search. A store can
  see a customer's details for orders punched *at that store*; there is no
  platform-wide or even single-store customer lookup/directory to build.
  Do not add a `Customer` model.
- **Snapshot everything onto the invoice** — item names, quantities, prices
  at time of sale — exactly like `OrderLine` already does for orders (name
  and amount are already snapshotted at creation, confirmed existing
  behavior). The explicit reasoning given: "avoids dependency of data" — the
  invoice must remain fully readable even if the underlying Product is later
  edited, deactivated, or deleted. Do not have the invoice join live against
  `Product` for its display data.
- No tax/GST fields (see the top-of-file exclusion).
- Give it the same **Print/View/Download/WhatsApp-share** treatment as the
  subscription invoice (Item 6) for consistency, reusing that pattern/
  those components where sensible rather than inventing a second UI
  language for it.
- Content: order line items (service, quantity, rate, amount), total,
  amount paid, balance due, payment method, order number, invoice number,
  date and time, store name/address/phone, customer name/phone — the same
  shape as the existing order detail view, reformatted as a standalone
  invoice document with its own number.

---

## Suggested build sequencing (not a hard requirement, but respects real dependencies and avoids two agents fighting over the same file or the same live database migration slot)

1. **Item 1 + Item 3 together** (same function, `requireStoreSession()`;
   Item 1 needs a schema migration — this should be the only agent running
   `prisma migrate dev` against the shared dev database at this time).
2. Once (1) has landed and its migration is applied: **Item 2** (depends on
   (1)'s schema) and **Item 7** (needs its own migration, safe once (1)'s
   is already applied and no other migration is in flight) can proceed
   together.
3. **Item 4**, **Item 5**, **Item 6** have no schema changes and don't
   depend on anything above — safe to build any time, including
   concurrently with (1).
