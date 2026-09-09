# Subscriptions & plans — implementation plan (StoreOps, P series)

Status: **implemented and verified** — see `.agents/CURRENT-STATE.md`'s
"Subscriptions & plans" section for what actually shipped and how it was
checked. The checklist below is the original pre-implementation plan, kept
for historical reference; individual items were not ticked off as they
landed, so do not read an unchecked box as "not done." Treat
`CURRENT-STATE.md` as authoritative over this file for current status.
Scope: the reusable Subscription Plan library, billing-by-store, invoices,
and the plan-based onboarding step. Mirrors the design canvas's P1–P10
screens. Dashboard is out of scope.

This is the largest gap between the design canvas and the real schema — the
app currently has no concept of a reusable "plan" at all, just a one-off
`depositAmount`/`annualFeeAmount` typed per store at onboarding
(`Subscription` model). Read this whole file before starting; several items
below require a schema migration.

## 1. Schema changes

`prisma/schema.prisma` needs:

- [ ] New `SubscriptionPlan` model — the reusable library (P1). Fields:
      `id`, `name`, `depositAmount` (paise), `annualFeeAmount` (paise),
      `billingCycle` (start with a fixed `ANNUAL` enum of one value if nothing
      else is planned, so the field exists without over-building), `notes`,
      `archivedAt` (nullable — archive, not hard delete, since plans can be
      in use; see P7), `createdAt`/`updatedAt`.
- [ ] `Subscription.planId String?` — nullable FK to `SubscriptionPlan`, `SetNull`
      on plan delete (plans are archived not deleted, but keep the FK
      resilient anyway). Nullable because a store's subscription can still be
      fully custom/negotiated with no plan attached, per the original
      brainstorm ("waive deposit for a negotiated deal" without forcing a new
      plan into existence for a one-off).
- [ ] `Subscription.discountAmount Int @default(0)` — paise, the manual
      per-store discount from P3.
- [ ] `SubscriptionPayment.method String` — Cash/UPI, currently only
      `Payment` (the *order*-payment model) has a `method` column;
      `SubscriptionPayment` has none. Add it so the P3 invoice detail and the
      P2 billing-by-store table can show it. Reuse the same two literal
      values as `Payment.method` — see the "payment methods" note below,
      there is no enum backing either table today.
- [ ] Add a migration; no other tables need to change (`SubscriptionPayment`
      already has `invoiceSeq` autoincrement, which is what P3's "Invoice
      detail" screen is keyed on).

## 2. Payment methods — Cash/UPI as "one shared list"

The design's requirement was: Cash and UPI, used identically everywhere,
"same id ... used everywhere." Today `Payment.method` (order payments) is a
free-text `String` with no validation or shared source of truth at all.

- [ ] Decide the representation: a Prisma `enum PaymentMethod { CASH UPI }`
      shared by both `Payment.method` and the new `SubscriptionPayment.method`
      is the simplest way to get "one definition, used everywhere" without
      building a whole Payment Methods management screen (which the design
      canvas explicitly did not build — flagged there as optional future
      work). An enum gets you the "unique ids, referenced everywhere"
      requirement for free, with no new table.
- [ ] Migrate `Payment.method` from free-text to the new enum — check
      existing data for values outside `Cash`/`UPI` before writing the
      migration (this table has lived as free text; there is real order
      history to reconcile, unlike the additive-only P-series columns above).

## 3. Backend

New `src/server/services/subscription-plans.ts`:

- [ ] `listPlans()` — P1/P2. Include a per-plan count of attached stores
      (`Subscription.planId` group-by) for "how many stores use each" — the
      Subscriptions area's explicit ask.
- [ ] `getPlan(planId)` — P5 detail, including the list of stores currently
      on it (needed for P7's "delete blocked while in use" and P8's reassignment
      flow).
- [ ] `createPlan(input, superAdminId)` / `updatePlan(planId, input, superAdminId)`
      — P6.
- [ ] `archivePlan(planId, superAdminId)` — P7. Block if the plan has active
      subscriptions attached *unless* a `reassignTo` planId (or explicit
      "leave attached stores as custom/unplanned") is supplied — the design's
      P7 screen implies exactly this choice, build the reassignment path, not
      just a hard block.
- [ ] `changeStorePlan(storeId, planId | null, input, superAdminId)` — P8.
      Updates `Subscription.planId`, and optionally `depositAmount`/
      `annualFeeAmount`/`discountAmount` if the admin overrides the plan's
      defaults for that store (the negotiated-deal case from the original
      brainstorm).

Extend `src/server/services/stores.ts`:

- [ ] `onboardStore()`'s subscription block currently takes raw
      `depositAmount`/`annualFeeAmount` (see `onboardSchema` in
      `stores.ts`). Extend `OnboardStoreInput` to accept
      `{ planId } | { custom: { depositAmount, annualFeeAmount } }`, plus the
      new `discountAmount` and `notes` fields already partially modeled
      (`Subscription.notes` exists; `discountAmount` is new per above). This
      is the backend for P9/P10 (pick-plan, then review) — see the open
      decision below on whether it *replaces* the current step 3/4 or lives
      alongside it.
- [ ] `recordSubscriptionPayment(storeId, input, superAdminId)` — there is
      currently **no service function for this at all**. `onboardStore()`
      writes the first two `SubscriptionPayment` rows inline as part of the
      transaction, but nothing lets an admin record a *renewal* payment
      against an already-active subscription later. This gap was flagged
      during the design pass (the old G-series "Record payment" screen was
      removed without a replacement) and needs a decision + screen before
      this area is complete — see Open decisions.
- [ ] `listStoreInvoices(storeId)` / `getInvoice(invoiceSeq)` — P2's
      billing-by-store table and P3's invoice detail read from
      `SubscriptionPayment` directly (it already has everything: `invoiceSeq`,
      `type`, `amount`, `paidAt`, `coversFrom/To`); this is a straight query
      function, no new writes.
- [ ] zod schemas for all of the above, plan input following the existing
      `onboardSchema` style.

## 4. Server Actions

New `src/features/super-admin/actions/subscription-plans.actions.ts`,
`requireSuperAdmin()`-gated:

- [ ] `createPlanAction`, `updatePlanAction`, `archivePlanAction`
- [ ] `changeStorePlanAction`
- [ ] `recordSubscriptionPaymentAction` (once the Open decision below is
      resolved)

Extend `stores.actions.ts`'s `onboardStoreAction` to pass through the new
plan-or-custom shape.

## 5. Frontend

New components under `src/features/super-admin/components/`, new route
`src/app/super-admin/subscriptions/`:

- [ ] `PlansEmptyState` — P4.
- [ ] `SubscriptionPlansTable` — P1, the library with the "stores using this
      plan" count column, row menu (edit / archive).
- [ ] `PlanDetail` — P5.
- [ ] `PlanEditor` — P6, includes the Notes field and Cash/UPI-aware fields
      only if a plan-level default payment method is wanted (design put
      Cash/UPI at the payment-recording level, not the plan level — confirm
      this doesn't need to change).
- [ ] `PlanArchiveDialog` — P7, with the reassign-or-detach choice from the
      backend section above.
- [ ] `ChangePlanDialog` — P8, from Store Detail's Subscription tab.
- [ ] `SubscriptionsBillingTable` — P2, full-width (already the target layout
      per the last design pass), per-store deposit/annual fee/paid-through/
      status.
- [ ] `InvoiceDetail` — P3, Billed-to/Payment side by side, full-width
      line-items table, Activity/Subscription+Notes side by side below
      (already laid out this way in the design canvas — this is porting that
      layout to a real page, not redesigning it).
- [ ] `OnboardPickPlan` / `OnboardPlanReview` — P9/P10, new steps 3/4 for
      `OnboardingWizard.tsx`, gated on the Open decision below on whether they
      replace or sit alongside the current inline step 3/4.
- [ ] Store Detail's Subscription tab (E3 in `STORES-IMPLEMENTATION.md`) reads
      from `listStoreInvoices`/the current `Subscription` row — build after or
      alongside Store Detail itself.

## Open decisions (confirm before building — do not guess on these)

- **P9/P10 vs. the existing D3/D4 onboarding steps**: does plan-based
  selection *replace* the current "type deposit/fee directly" step in
  `OnboardingWizard.tsx`, or do both paths need to coexist (e.g. "use a plan"
  vs. "custom terms" as a fork within step 3)? This was flagged multiple
  times during the design pass and never resolved. Pick one before touching
  `OnboardingWizard.tsx` — it's a shared, working component with no v2 branch
  to build against.
- **Renewal payments**: with the old "Record payment" screen removed, decide
  where/how an admin records a renewal payment on an already-active
  subscription (a new screen off Store Detail's Subscription tab? Off the
  Subscriptions billing table's row menu?) before building
  `recordSubscriptionPayment` and its UI — the backend function above is
  scoped generically enough to serve whichever screen is decided on, but the
  screen itself doesn't exist in the canvas yet.
- **Plan changes on active subscriptions**: when `changeStorePlan` swaps a
  store from one plan to another mid-cycle, does `paidThroughDate` carry over
  as-is, get recalculated, or require a fresh payment? Not specified in the
  design; needs a product decision, not an engineering guess, since it
  directly affects what a store owner is billed.
