# Owner Workspace 2.0 — requirements, module by module

Source of truth for implementing the redesigned owner/employee workspace
(Dashboard, Products, Sales, Orders, Expenses, Employees, Profile, Outlets)
against the multi-outlet backend already described in `CURRENT-STATE.md` and
`BACKEND-PLAN.md`. This document translates the approved design canvas into
requirements; it does not itself change any backend contract.

**Design reference (source of truth for visuals):**
- Canvas: https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv (private — the
  owner must share it, via the artifact's own Share menu, with whoever/
  whatever needs to view it before implementation starts)
- It is a Design-canvas artifact: one `index.html` shell plus one `.dc.html`
  file per screen, listed under "Design reference" in each module below by
  its exact board file name. Open the canvas, then open that board by name.
- `project/shared.css` in the same artifact is the actual design-token/
  component CSS backing every screen — treat it as the literal spec for
  colors, spacing and the shared classes listed in the component library
  below, not just a visual reference.

**Non-goals of this document:** it does not re-litigate anything already
decided and shipped per `CURRENT-STATE.md` (schema, auth, services, existing
routes). Where a module below needs backend that already exists, that's
called out; where it needs backend that doesn't exist yet, that's called out
too, explicitly, so Gemini doesn't guess.

---

## 0. Reusable components — build these once, use everywhere

Every module below is built from this fixed set. Do not let any one screen
invent its own one-off variant of these — that's the #1 thing this redesign
is enforcing over the current app.

| Component | Design source (CSS class) | Used on |
| --- | --- | --- |
| `Dialog` (centered, native `<dialog>`-style modal) | `.dialog-scrim`, `.dialog`, `.dialog.wide`, `.dialog-head`, `.dialog-body`, `.dialog-close`, `.dialog-foot` | ProductEditDialog, EmployeeCreateDialog, ExpenseEditDialog — **every** create/edit flow, no side-nav panels anywhere |
| `Card` | `.card`, `.card-heading` | nearly every screen |
| `StatTile` | `.stats-row`, `.stat-tile` | Dashboard (both), Outlet detail |
| `Badge` | `.badge`, `.badge.on/.off/.warn` | status everywhere (Active/Inactive, Paid/Due, order status) |
| `Tag` | `.tag`, `.tag .default-dot` | outlet chips on Employees list |
| `Pill` (single-select filter) | `.pill`, `.pill.active` | Products grid/list toggle, Expenses outlet filter, mobile status filter |
| `MultiSelectDropdown` | `.dropdown-wrap`, `.dropdown-menu`, `.dropdown-check-row`, `.dropdown-foot` | Orders outlet filter, Employee "Active outlets", Expense "Applies to" — **any multi-pick control uses this, never a chip row** |
| `SingleSelectDropdown` | `.dropdown-wrap`, `.dropdown-menu`, `.dropdown-radio-row` | Orders status filter |
| `OutletSwitcher` | `.switcher-trigger`, `.switcher-menu`, `.switcher-option` | Dashboard topbar (owner only; adds "All outlets") |
| `Toggle` | `.toggle`, `.toggle.on`, `.toggle .knob` | Profile → Payment methods enable/disable |
| `Pagination` | `.pagination`, `.page-btn`, `.page-btn.active` | Orders (desktop) |
| `Avatar` | `.avatar` | topbar identity everywhere |
| `EmptyState` | `.empty-state` | any list with zero rows (first-use vs filtered-empty copy differs — see SharedListStates below) |
| `ErrorBanner` | `.error-banner` | list load failure (inline, top of screen — **never** a popup for a load failure); also reused as an info banner (tint background) for read-only notices (Outlets list, Outlet detail, Products) |
| `ShimmerRow` | `.shimmer.row/.line/.tile` | loading state for any list/table, sized to the real row height so there's no layout jump |
| `Sentinel` (infinite-scroll loader) | `.sentinel`, `.spinner` | Orders mobile |
| `SectionNote` | `.section-note` | small uppercase eyebrow label above a sub-section |

**Design reference for the state pattern:** `SharedListStates.dc.html`. It is
the spec for Loading/Empty/Error on every list screen — implement it once as
shared UI state handling (e.g. a hook/wrapper each list screen uses), not
per-screen. Rules from that board:
- Loading = row skeletons at the real row height.
- Empty = icon + heading + one line of copy + a primary action; the copy is
  screen-specific and **must** distinguish first-use-empty ("no services
  yet") from filtered-empty ("no results for this filter") — same layout,
  different copy, never the generic "no results" for both cases.
- Error = inline banner + Retry at the top of the screen; the stale/last-good
  rows dim underneath rather than disappearing. A dialog only ever shows an
  error for its own save/submit failure, never for a list load failure.

---

## 1. Dashboard

**Design reference:** `Dashboard-SingleOutlet.dc.html`, `Dashboard-AllOutlets.dc.html`

- Single-outlet organizations get `Dashboard-SingleOutlet`: no switcher, no
  "All outlets" pill — there is nothing to switch between. Header states the
  outlet name directly ("📍 Chinnapanahalli").
- Multi-outlet organizations get `Dashboard-AllOutlets`, which is the
  **only** screen with an "All outlets" option in its `OutletSwitcher`
  (see `showAllOutletsOption` gating already in `AdminChrome.tsx` per
  `CURRENT-STATE.md`'s W2 section — this design keeps that gating, it does
  not extend "All outlets" to any other screen).
- Both dashboards share: 4-tile stats row (Today's sales, Orders today,
  Pending, Expenses this month), a 14-day sales trend chart, Recent orders,
  Needs attention.
- `Dashboard-AllOutlets` additionally has:
  - **Per-outlet summary** — one card per outlet: sales/orders/pending today,
    a share-of-best-outlet progress bar (`width:` proportional to that
    outlet's sales ÷ the top outlet's sales) + a plain "↑/↓ N% vs yesterday"
    badge, and a "View detail →" link to that outlet's Outlet-Detail screen.
    This is the finalized comparison widget — earlier bar-chart/donut/
    ranking-table/sparkline explorations were tried and retired in favor of
    this.
  - **Earnings vs expenses — this month**, combined across outlets (donut,
    Earnings/Expenses split + Net figure). This is the *same component* as
    the one on Outlet-Detail (below), just fed the aggregate instead of one
    outlet's numbers — do not build two implementations of this chart.
  - **Recent orders — all outlets**, with an added Outlet column.
- Data: this is a straight read from `DailyOutletSummary`/
  `DailyOutletServiceSummary` (already real per `CURRENT-STATE.md` B6) for
  the per-outlet cards and comparison; the combined donut and recent-orders
  table reuse the existing `dashboardData()` aggregation path described
  under "Multi-outlet W1/W2" and the "owner multi-store dashboard" item in
  `CURRENT-STATE.md` — do not write a second aggregation function.

## 2. Products

**Design reference:** `Products-List.dc.html`, `ProductEditDialog.dc.html`

- List: search, a Grid/List `Pill` toggle (view-mode only, not a data
  filter), table with ID/Service/Category/Pricing/Status/Edit. An inline
  info `ErrorBanner`-styled notice states services are organization-wide
  (a change applies at every outlet, not one branch) — matches the existing
  backend contract (Product has no `outletId`; catalogue is org-scoped).
- Edit dialog (`Dialog`, not wide): name, category, charging type, and
  **pricing slabs as a dynamic list** — each row has its own remove (✕)
  control, plus a "＋ Add price slab" action below the rows. This replaces
  the old fixed-2-row layout; slabs must be addable and removable freely,
  not capped at 2 or 3.
- Active/inactive toggle row, inline field-error text for invalid price.

## 3. Sales

No screen in this design pass — out of scope. The existing `/admin/sales`
counter/POS flow is unchanged; do not redesign it as part of this handoff.
If it later needs the shared `Dialog`/`MultiSelectDropdown` treatment, that's
a separate pass.

## 4. Orders

**Design reference:** `Orders-Desktop.dc.html`, `Orders-Mobile.dc.html`

- Desktop: one filter row — Outlets (`MultiSelectDropdown`, "◫ Outlets (3 of
  3) ▾"), Status (`SingleSelectDropdown`), From/To date fields, Search —
  all in a single row, search pinned right. Table with an Outlet column.
  Page-numbered `Pagination` with a windowed page list (`1 2 3 … 13 14`,
  previous arrow disabled on page 1).
- Mobile: header with `OutletSwitcher`, horizontally-scrollable status
  `Pill` row, card-per-order list, infinite scroll via `Sentinel`.
- Both are read scoped to the resolved outlet selection exactly as
  `resolveOutletSelection()`/`resolveStoreSelection()` already do per
  `CURRENT-STATE.md` — no new selection mechanism.

## 5. Expenses

**Design reference:** `Expenses-List.dc.html`, `ExpenseEditDialog.dc.html`

- List: `Pill` row — All / Organization-wide / one pill per outlet (single-
  select, unlike Orders' outlet filter which is multi-select — keep this
  distinction, it's intentional: an expense is either org-wide or belongs to
  exactly one outlet, so filtering by it is naturally single-select).
  Table has an Outlet column that shows "Organization-wide" as a tinted
  badge instead of an outlet name for those rows.
- Add/edit dialog: Title, Category, Amount, Due date, and "Applies to" as a
  `MultiSelectDropdown` (Organization-wide + each outlet as checkboxes) —
  this was upgraded from a chip row per design feedback; confirm with the
  backend contract whether an expense can actually apply to more than one
  specific outlet at once, or whether the UI should still only commit a
  single `outletId` (or null for org-wide) even though the picker looks
  multi-select. **Flagged as an open question below — do not assume either
  way.**

## 6. Employees

**Design reference:** `Employees-List.dc.html`, `EmployeeCreateDialog.dc.html`

- List: subtitle states "N employees across M outlets · deactivating
  restricts their sign-in to this organization only" (matches
  `StoreMembership.active` semantics from `CURRENT-STATE.md` — deactivation
  is per-organization, not global `User.active`). Outlet column uses
  compact `Tag`s (not the larger `outlet-chip`), default outlet marked with
  a small dot, not a separate badge. Row actions: Deactivate/Reactivate
  (`btn-danger`/`btn-primary`) **and** "Manage →", side by side — both are
  needed, Manage isn't replaced by the status action.
- Add dialog (wide `Dialog`): Name/Phone, Username/temporary-password
  (auto-generated, shown once), "Active outlets" as a `MultiSelectDropdown`
  (replacing the old outlet-chip row) with the current selection echoed as
  `Tag`s underneath, and a Default-outlet `<select>` constrained to the
  outlets actually selected above.

## 7. Profile

**Design reference:** `Profile.dc.html`

Two-column grid of cards:
- Profile details (name/username/phone/email) + Edit.
- Security (password last changed + Change password).
- Billing & subscription (plan, deposit, annual fee, paid-through date) —
  read-only here, matches existing subscription/plan backend.
- **Payment methods** (new): one row per platform-defined method (Cash, UPI,
  Card, …), each with a `Toggle`. This is the owner-facing enable/disable
  for `OrganizationPaymentMethod` against the `PlatformPaymentMethod`
  catalogue described in `CURRENT-STATE.md`'s B4 — toggling here must flip
  `OrganizationPaymentMethod.active` (or create/deactivate the row) for that
  org, and take effect at every outlet's checkout immediately, matching the
  card's own footer copy.
- Outlets (read-only directory + "View all →" into the Outlets module below).

## 8. Outlets (new module)

**Design reference:** `Outlets-List.dc.html`, `Outlet-Detail.dc.html`,
`Outlet-Detail-Alt.dc.html`

- List: read-only directory (name, address, code, status, opened date,
  "View →"). Info banner states outlets are created/edited by the platform
  only — no create/edit affordance belongs on this screen; that stays a
  Super Admin capability per `CURRENT-STATE.md`'s existing
  `/super-admin/stores/[storeId]/outlets`.
- Detail (2:1 grid layout): left column — Today's snapshot (4 `StatTile`s
  including "Items sold today"), Earnings vs expenses this month (bar
  version — see below), 14-day sales trend, Employees at this outlet table.
  Right column — Contact & details (read-only, same "contact platform
  support to change" notice as the list), Order status today (donut,
  Delivered/Ready/In progress/Pending share).
- `Outlet-Detail-Alt.dc.html` is a **standalone alternative framing** of the
  same Earnings-vs-expenses figures as a donut instead of two comparison
  bars — it is not a second screen to build, it's a component variant to
  choose between for that one card. Confirm with the owner which framing
  (bars, from Outlet-Detail, or donut, from Outlet-Detail-Alt) ships; both
  read the same underlying numbers.

---

## Cross-cutting / open questions for the owner before Gemini starts

1. **Expense "Applies to" cardinality** (Module 5): the picker was made
   multi-select per feedback, but confirm whether `Expense` should actually
   support multiple `outletId`s, or whether the UI should still resolve to
   one outlet (or org-wide) on save. This changes the data model, not just
   the UI.
2. **Outlet-Detail earnings widget**: bars (Outlet-Detail.dc.html) vs. donut
   (Outlet-Detail-Alt.dc.html) — pick one to ship; both are fully designed.
3. **`CURRENT-STATE.md` has two overlapping "multi-outlet" narratives** — an
   earlier "W1/W2" section describing an outlet switcher and outlet-scoped
   Dashboard/Orders/Expenses already built and browser-verified, and a later
   "Multi-Outlet & Organization Foundation (Backend Task B1/B2)" section
   describing `Outlet`/`OutletMembership` as freshly added, schema-only, and
   explicitly "not yet used for authorization... multi-outlet behavior is
   not implemented in this phase." These read as contradictory. Before
   Gemini wires any screen above to real data, it should verify against the
   actual current repo state (not just this doc) which of those two
   descriptions is accurate today, and update `CURRENT-STATE.md` if it's
   stale. I'm flagging this rather than guessing which is current.
4. **Artifact sharing**: the design canvas is private to this account. Share
   it (its own Share menu) with whatever account/session Gemini reads links
   as, or export/attach the relevant `.dc.html` screenshots directly, before
   handoff — otherwise the design links below are dead ends for Gemini.

---

## Prompt to hand to Gemini

See the accompanying message — a ready-to-paste prompt referencing this file
and the design canvas is provided separately so it can be copied without the
surrounding requirements text.
