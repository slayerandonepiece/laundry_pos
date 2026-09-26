# Organization ↔ Outlet — End-to-End UI Requirements

**Audience:** Gemini (implementer). Claude wrote this spec from a real grep of the
current codebase (commands and raw output are in Appendix A) and will
independently re-verify every item after implementation — do not mark
anything "done" without it actually rendering correctly in the running app.

**Do not trust any prior status claims** (from commit messages, comments, or
previous AI sessions) about what's already fixed. Verify each item yourself
against the live app at `http://localhost:3000/super-admin/**` before and
after your change.

---

## 1. The naming rule (read this first, it governs every fix below)

Three distinct concepts exist in this product. Every UI string must use the
**right one**, consistently:

| Level | User-facing word | Internal code identifier (DO NOT RENAME) |
|---|---|---|
| The tenant / laundry business as a whole | **Organization** | `Store` (Prisma model, `storeId`, `StoreListItem`, `stores.ts`, `/super-admin/stores` routes, `store` variable names) |
| A single physical branch/location under an organization | **Outlet** | `Outlet` (already correctly named in code, keep as-is) |
| Neither | ~~"Store"~~ | — |

**"Store" must never appear in user-visible text** — not in button labels,
page titles, dialog titles, menu items, aria-labels, toast/error messages, or
help copy. It is the legacy internal name and stays in code
(variables/imports/routes/DB) but must be fully invisible to the person using
the app.

When you hit a piece of code and can't tell whether it means the
organization or the outlet, use this test: **does this data/action apply to
the whole tenant (billing, users, org-level lock/archive), or to one physical
location (address, staff assigned there, opening/closing)?** The former is
Organization, the latter is Outlet. Never leave a shared/ambiguous word like
"store" to cover both — pick the correct one explicitly.

Code identifiers, import paths, and URL routes (`/super-admin/stores/...`,
`stores.ts`, `store.id`, etc.) are **out of scope for this task** — renaming
those is a separate, larger, riskier task not requested here. Change display
text only.

---

## 2. Confirmed leaks — fix every one of these

Each row: file, line (approximate — content may have shifted slightly since
this was written, search for the quoted string), current text → required text.

### Organizations list (`src/features/super-admin/components/StoresDirectory.tsx`)
- `'View store detail'` → `'View organization detail'`
- `'Lock store'` / `'Unlock store'` → `'Lock organization'` / `'Unlock organization'`
- `'Delete store'` → `'Archive organization'` (this action already archives via
  soft-delete, not a hard delete — see `DeleteStoreDialog.tsx`, also renamed below)
- `` `Edit ${store.name}` `` (aria-label on the edit icon-button) is fine as
  phrasing (uses the org's own name, not the word "store") — **verify this
  one is actually fine as-is**, don't change something that's already correct
- Any other row-menu / aria-label text containing the literal word "store" — fix

### Onboard flow (`src/app/super-admin/(shell)/stores/page.tsx`, `src/features/super-admin/components/OnboardStoreAction.tsx`, `OnboardingWizard.tsx`)
- The button opening the wizard currently reads "Onboard store" somewhere in
  the flow (component is literally named `OnboardStoreAction`) — the visible
  button text must read **"Onboard organization"** everywhere it appears
  (list page already has this right per a prior fix — verify it didn't
  regress, then fix every other place the wizard's own internal copy still
  says "store")
- Step 1 heading `'Store details'` → `'Organization details'`
- Field label `'Store name'` → `'Organization name'` (appears in both
  `OnboardingWizard.tsx` and `StoreEditDialog.tsx`)
- Validation message `'Enter a store name.'` → `'Enter an organization name.'`
  (both files)
- Placeholder text `"e.g. 2nd store, bundled with Store #1"` → rephrase
  without the word "store" — **check the actual intent first**: if this
  field is about adding a second *outlet* under an existing organization,
  the copy should say "outlet", not just be a generic rename — read the
  surrounding code to confirm which concept this field actually describes
  before rewording
- Checkbox/label `'Existing owner (multi-store)'` → `'Existing owner
  (multiple organizations)'`
- Error toasts `'Could not onboard this store. Try again.'` → `'Could not
  onboard this organization. Try again.'`
- `'This store'` (wherever it appears as a summary label) → `'This
  organization'`
- Success screen text referencing `createdStore` — variable name can stay,
  but the **rendered heading/copy** (e.g. "{createdStore.name} is live") must
  not include the literal word "store" anywhere in the actual displayed
  sentence — audit the full success-step JSX for this
- The Review step must clearly separate an "Organization details" section
  from any "Outlet" section if a first outlet is created as part of
  onboarding — check `WizardReview.dc.html` in the design (link in section 4)
  for how this separation is meant to look

### Organization detail — Overview / header (`StoreDetailShell.tsx`, `StoreOverviewTab.tsx`)
- "Edit store" button → **"Edit organization"**
- Any card/section titled with "store" → retitle to "organization" or
  "Organization details" as appropriate (the Overview tab's "Organization
  details" card title is already correct per a prior fix — verify, don't
  regress)
- The page-header status badge next to the org name (top of every tab) —
  separately tracked known bug: it currently uses old binary
  `ACTIVE`/`LOCKED` status instead of the real lifecycle state from
  `src/server/services/store-lifecycle.ts`. Fix this in the same pass since
  you'll already be in this file.

### Edit & Danger Zone (`StoreEditFull.tsx`, `DeleteStoreDialog.tsx`, `LockStoreDialog.tsx`)
- Page heading "Edit store" → **"Edit organization"**
- `StoreEditDialog.tsx` label `'Store name'` → `'Organization name'`
- `DeleteStoreDialog.tsx`:
  - `` `Can't archive ${store.name}` `` — fine, uses the org's actual name, no
    "store" word — verify only
  - Any surrounding button/label still literally saying "Delete store" →
    **"Archive organization"**
- `LockStoreDialog.tsx`:
  - Button labels `'Lock store'` / `'Unlock store'` → **"Lock organization"**
    / **"Unlock organization"**
  - Error toast `'Could not update this store. Try again.'` → `'Could not
    update this organization. Try again.'`
  - Dialog title `` `Lock ${store.name}?` `` — fine (uses actual org name) —
    verify only

### Outlets tab / Outlet detail (`StoreOutletsTab.tsx`, `OutletDetailView.tsx`, `AddOutletDialog.tsx`)
This is the other half of the bug you're fixing: outlet-scoped screens must
say **"outlet"**, not leak "store" either. Audit:
- `OutletDetailView.tsx` uses the literal word `"store"` somewhere in copy —
  find it and confirm what it should say. A breadcrumb/subtitle like
  `{store.name} · {outlet.outletCode}` is fine since it's the actual org
  name being interpolated, not the word "store" — but a literal string like
  `"Back to store"` anywhere near outlets must become **"Back to
  organization"**
- Confirm every button/menu item on the Outlets tab and Outlet detail screen
  says "outlet" for outlet-scoped actions (Add outlet, Edit outlet, Close
  outlet, Reopen outlet, Relocate outlet) and never says "store"

### Subscription / Billing screens
- `src/app/super-admin/(shell)/subscriptions/billing/page.tsx`: `"Deposits,
  annual fees and renewal standing for every store."` → `"...for every
  organization."`
- `src/app/super-admin/(shell)/subscriptions/page.tsx`: `"...when onboarding
  a store."` → `"...when onboarding an organization."`
- `src/features/super-admin/components/PlanDetail.tsx`: `'Stores using it'`
  / `'Stores on this plan'` / `'No stores yet'` / `"Attach this plan when
  onboarding a store..."` / `"Changes apply to stores using this plan..."` /
  table column header `'Store'` → all → "Organization"/"Organizations"
  equivalents (e.g. "Organizations using it", "Organizations on this plan",
  "No organizations yet", column header "Organization")
- `src/features/super-admin/components/PlanEditor.tsx`: `"Stores onboarded
  with this plan skip the deposit..."` → `"Organizations onboarded..."`
- `src/features/super-admin/components/PlanNewAction.tsx`: `"Set reusable
  subscription terms for stores."` → `"...for organizations."`
- `src/features/super-admin/components/PlansEmptyState.tsx`: `'What most new
  stores pay'`, `"...2nd store"`, `"Set reusable subscription terms for
  stores."` → organization equivalents
- `src/features/super-admin/components/SubscriptionPlansTable.tsx`: `"Create
  a plan to reuse its terms across stores."`, `'Stores using it'`, `"...
  Individual stores can still override... every store is moved off it."` →
  organization equivalents
- `src/features/super-admin/components/SubscriptionsBillingTable.tsx`:
  `"Search store or owner"` / `"Search store or owner…"` (placeholder AND
  aria-label — both), `'No stores match this search or filter.'`, column
  header `'Store'` → organization equivalents
- `src/features/super-admin/components/RecordPaymentDialog.tsx`: `"Recording
  a payment for {storeName}."` — uses the actual name via a variable, this is
  fine, but check the variable/prop name `storeName` is only an internal
  identifier and the rendered sentence never contains the literal word
  "store" elsewhere in this dialog
- `src/features/super-admin/components/ChangePlanDialog.tsx`: `"...the
  store's current paid-through date..."` → `"...the organization's current
  paid-through date..."`
- `src/features/super-admin/components/InvoiceDetail.tsx`: label `'Store'`
  (appears twice, once per invoice section) → `'Organization'`; `"Back to
  store"` → `"Back to organization"`

### Users pages
- `src/app/super-admin/(shell)/users/page.tsx`: `"Every account on the
  platform, independent of store onboarding."` → `"...independent of
  organization onboarding."`

### Global / error pages
- `src/app/super-admin/(shell)/page.tsx` (Dashboard subtitle): `"How the
  platform is doing — stores, users and subscriptions at a glance."` →
  `"...organizations, users and subscriptions..."`
- `src/app/super-admin/not-found.tsx`: `"That store, user, plan or invoice
  doesn't exist..."` → `"That organization, user, plan or invoice doesn't
  exist..."`

### Do NOT touch (legitimate, not UI text)
- `storeId`, `store.id`, `store.name` (variable/property access — fine,
  keep), `StoreListItem`/`StoreDetail`/`StoreStatus` (type names), the
  `@/server/services/stores` import path, `/super-admin/stores/...` routes,
  `'private, no-store'` (this is an HTTP `Cache-Control` header value, not
  UI text — leave alone), `storeCount` fields, `StoreDetailShell.tsx` /
  `StoreOverviewTab.tsx` / etc. **component file names** (renaming files is
  out of scope here — only the text they render matters)

---

## 3. Verification checklist (do this after every batch of fixes)

For each screen below, load it in the running app and confirm **zero**
instances of the literal word "store" (case-insensitive) are visible
anywhere on screen — headings, buttons, menus, dialogs, toasts, placeholders,
table headers, tooltips:

- [ ] `/super-admin/stores` (Organizations list) — including the row menu
      (⋮) opened on a row, and the "Onboard organization" wizard opened from here
- [ ] `/super-admin/stores/[storeId]` (Overview tab) — including the header
      badge, Edit button, and Lock/Archive dialogs opened from here
- [ ] `/super-admin/stores/[storeId]/edit` (Edit & Danger Zone)
- [ ] `/super-admin/stores/[storeId]/outlets` and outlet detail — confirm
      these correctly say "outlet", not "organization" either, for
      outlet-scoped things
- [ ] `/super-admin/stores/[storeId]/users`
- [ ] `/super-admin/stores/[storeId]/subscription` — including Record
      Payment and Change Plan dialogs
- [ ] `/super-admin/stores/[storeId]/activity`
- [ ] `/super-admin/subscriptions`, `/super-admin/subscriptions/billing`,
      a plan detail page, an invoice detail page
- [ ] `/super-admin/users` and a user detail page
- [ ] `/super-admin` (Dashboard)
- [ ] Any 404 (not-found) page under `/super-admin/**`

Re-run this grep from the repo root after your changes and confirm the
matched-line count for genuine UI text has dropped to (ideally) zero, with
only the legitimate code-identifier lines from Appendix A remaining:

```bash
grep -rnoE "(>|['\"\`])[^<'\"\`]*[Ss]tore[^<'\"\`]*(<|['\"\`])" src/features/super-admin src/app/super-admin
```

---

## 4. Design reference

For layout/state completeness beyond naming (this doc is about the naming
bug specifically — the fuller screen-by-screen functional spec was given
separately), the design canvas is at:
https://claude.ai/artifact/RYo9wYGymQ4qk22urBBoWf (view access only — read
via in-app browser, do not assume write access). Boards `OrgWizard.dc.html`,
`WizardStep1/2/Review/Success.dc.html`, `OrgOverview.dc.html`,
`OrgOutlets.dc.html`, `OrgEdit.dc.html` are the most relevant to this naming
pass since they show the correct copy in context.

---

## 5. Hard rules

- Text/copy changes only in this pass — do not rename variables, files,
  routes, Prisma models, or import paths.
- Do not touch backend logic — this is a display-string-only task.
- Keep diffs surgical — one string change per line, no reformatting.
- Run `npx tsc --noEmit --project tsconfig.json` after your changes (`rm -rf
  .next` first if you see stale `.next/types` errors).
- No `git commit`, `git push`, or destructive git commands.
- If you find a "store" occurrence not listed in section 2, still fix it —
  section 2 is a grounded starting point from one grep pass, not guaranteed
  exhaustive. Re-run the grep command in section 3 to catch anything missed.

## Appendix A — raw grep used to build this spec

```
cd /Users/reddygona/Documents/skills/laundry_pos
grep -rnoE "(>|['\"\`])[^<'\"\`]*[Ss]tore[^<'\"\`]*(<|['\"\`])" src/features/super-admin src/app/super-admin \
  | grep -viE "storeId|StoreListItem|StoreDetail|StoreStatus|storeRole|useStore|StoreDetailShell|StoreOverviewTab|StoreOutletsTab|StoreSubscriptionTab|StoreActivityTab|StoreUsersTab|StoreEditFull|StorePaymentMethod|storeCount|OutletsForStore|ForStoreAdmin|storeMembership" \
  | sort -u
```

Run this again anytime to re-check current state — do not rely on this
document's snapshot staying accurate as the codebase changes.
