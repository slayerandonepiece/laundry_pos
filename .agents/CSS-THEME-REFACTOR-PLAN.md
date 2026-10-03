# CSS / theme refactor plan — align the application on the Super Admin theme

Status: **plan only, nothing implemented.** Written 2026-09-20.

Goal: one Tailwind-based theme across the whole application, with the existing
Super Admin UI as the reference implementation. Owner and Employee screens are
migrated onto shared components extracted from Super Admin so the app stops
looking like three different products.

---

## 0. Scope

**In scope**
- Tailwind CSS v4 as the only styling mechanism: `@theme` tokens at the root,
  utilities written inline in TSX.
- A shared component library extracted from Super Admin's existing patterns.
- Owner + Employee (workspace) screens migrated onto that library.
- Deleting the duplicate CSS systems and duplicate components.

**Explicit non-goals**
- No redesign. No new colours, spacing scales, type ramps or layouts.
- No functional change: no new props, routes, permissions, queries or copy.
- **Super Admin's rendered UI does not change.** Its code is refactored onto the
  shared library, but every screen must render identically before and after.

**One intentional visual change**: Owner and Employee screens *will* look
different afterwards — they are being brought onto the Super Admin theme. That
is the point of the project. Nothing about their behaviour changes.

---

## 1. Current state

### 1.1 Four style systems, all loaded at once

| System | Files | Lines | Scoped? |
| --- | --- | --- | --- |
| `.soa` (Super Admin / StoreOps) | `src/app/super-admin/super-admin.css` | 496 | yes, `.soa ` prefix |
| Owner Workspace 2.0 | `src/app/(workspace)/admin/owner-workspace.css` | 757 | **no** — global `:root` + unscoped classes |
| Legacy `.ad-*` | `admin.css` 243, `tables.css` 226, `dashboard.css` 115, `counter.css` 66, `pos.css` 40 | 690 | yes, `.ad-` prefix |
| Marketing site leftovers | `src/app/globals.css` | 101 | **no** |

Total: **2,044 lines of CSS across 8 files**, plus **452 inline `style={{…}}`**
blocks and hardcoded hex values that restate existing tokens.

### 1.2 Tailwind is installed but inert

`postcss.config.mjs` wires `@tailwindcss/postcss`; `tailwindcss@4.3.3` is in
devDependencies. There is **no `@import "tailwindcss"` anywhere in the repo**,
and zero utility classes across 1,176 `className` usages. It currently compiles
nothing.

### 1.3 The previous Tailwind migration was never committed

`.agents/TAILWIND-MIGRATION-SYNC.md` records `pos.css`, `counter.css`,
`tables.css` and `globals.css` as "migrated and deleted", with passing
verification. Checked against git: **all four exist at HEAD at their original
size**, and `HEAD:src/app/globals.css` contains zero Tailwind references. That
work is not in git history at all.

The failure was procedural, not technical: parallel agents edited one shared
tree, nothing was committed per step, and progress was self-reported rather
than measured. Section 5 exists to prevent a repeat.

### 1.4 Concrete defects

1. **`owner-workspace.css` bleeds into Super Admin.** It declares nine class
   names unscoped that `.soa` also defines:
   `card · btn · dialog · dialog-head · dialog-body · dialog-foot · badge · field · shimmer`.
   `.soa .card` (0,2,0) wins on properties both declare, but any property only
   `owner-workspace.css` declares leaks through. This is the mechanism behind
   the inconsistent backgrounds, tables and dialogs.
2. **Token scopes collide.** `owner-workspace.css:1` declares `--ink`,
   `--muted`, `--bg` on global `:root` — the same names `globals.css:1` uses —
   and is imported after it in `src/app/layout.tsx`, silently retinting the app.
3. **`globals.css` is ~95% dead.** Hero, services, pricing, statement, location,
   CTA and calculator-modal rules from the extracted marketing site. Only the
   loading/spinner/error primitives at the end are live.
4. **Two unrelated app shells.** `AdminChrome.tsx` uses `.ad-*` and **emoji
   glyphs** (`◧ ◇ ▤ ₹ ◎`) for nav icons; `SuperAdminChrome.tsx` uses `.soa` with
   real SVGs from `Icon.tsx` and hardcodes `StoreOps / PLATFORM ADMIN` as brand.
   Each carries its own copy of the mobile `<dialog>` drawer and focus trap.
5. **Three Dialog implementations**: `admin/components/ui/Dialog.tsx`,
   `super-admin/components/Dialog.tsx`, and `Panel` + `ConfirmationDialog` in
   `admin/components/Primitives.tsx`. `Primitives.tsx` additionally duplicates
   `Badge` and `Empty` against `ui/Badge` and `ui/ListStates`.

### 1.5 What already exists and should be kept

`src/features/admin/components/ui/` (13 primitives — Dialog, Card, StatTile,
Badge, Tag, Pill, Dropdown, OutletSwitcher, Toggle, Pagination, Avatar,
SectionNote, ListStates) is untracked in git but already consumed by 15 screens.

It is the right shape and the right API. Its only problem is that it renders
`owner-workspace.css` class names instead of Tailwind utilities. It becomes the
seed of the shared library rather than being thrown away.

### 1.6 The two palettes are already identical

| Token | `.soa` | Owner Workspace 2.0 canvas |
| --- | --- | --- |
| brand | `#0758d6` | `#0758d6` |
| brand ink | `#064bbb` | `#064bbb` |
| brand tint | `--brand-soft: #eef3ff` | `--tint: #eef3ff` |
| ink | `#102039` | `#102039` |
| muted | `#5b6879` | `#5b6879` |
| card radius | `--r-card: 14px` | `--radius-lg: 14px` |
| control radius | `--r-ctl: 10px` | `--radius: 10px` |
| border | `--line-2: #e0e6ee` | `--border: #e4e8ee` |

Only the border value diverges. Unification is a rename, not a redesign — which
is what makes "align everything on Super Admin" a low-risk operation.

---

## 2. Target architecture

### 2.1 Root — `src/app/app.css` (replaces `globals.css`)

The only stylesheet the application always loads.

```css
@import "tailwindcss";

@theme {
  --color-brand: #0758d6;
  --color-brand-ink: #064bbb;
  --color-brand-soft: #eef3ff;
  --color-ink: #102039;
  --color-ink-2: #3d4a60;
  --color-muted: #5b6879;
  --color-faint: #94a1b3;
  --color-line: #ecf0f4;
  --color-line-2: #e0e6ee;
  --color-head: #f6f5f0;
  /* semantic pairs, taken verbatim from .soa */
  --color-good-fg: #146d4e;  --color-good-bg: #edf7f2;
  --color-warm-fg: #94631c;  --color-warm-bg: #fcf5e8;
  --color-bad-fg:  #ab3434;  --color-bad-bg:  #fff0ef;
  --color-info-fg: #0758d6;  --color-info-bg: #edf3ff;
  --color-gray-fg: #5b6879;  --color-gray-bg: #f1f3f6;

  --radius-card: 14px;
  --radius-ctl: 10px;

  --font-display: 'Manrope Variable', system-ui, sans-serif;
  --font-body: 'DM Sans Variable', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', SFMono-Regular, Menlo, monospace;
}
```

Plus a small base layer (body defaults, `:focus-visible` ring,
`prefers-reduced-motion`) and the two global `@keyframes` (`spin`, `shimmer`).

Token values are taken from `.soa` because Super Admin is the reference.
`--border: #e4e8ee` from the owner canvas resolves to `--color-line-2`.

These generate `bg-brand`, `text-ink`, `border-line-2`, `rounded-card`,
`font-display` — so utilities and any residual CSS read one source of truth.

### 2.2 Feature CSS — only where a utility genuinely cannot express it

Permitted contents, and nothing else:

- `::backdrop` on native `<dialog>`
- `@media print` blocks (invoice printing)
- `@page` rules
- Third-party overrides (`@react-pdf` viewer iframe)

Expected size: tens of lines per feature, not hundreds. A feature CSS file is a
reviewable exception, and each one carries a comment saying why the utility
approach does not work for that rule.

### 2.3 Shared library — `src/features/shared/ui/`

One library, consumed by both feature slices. Seeded from the existing
`admin/components/ui/`, with each primitive's rendering re-pointed to Tailwind
utilities that reproduce Super Admin's appearance.

---

## 3. Extraction inventory

Shared components, and the Super Admin `.soa` family each one is derived from.
Rule counts are from `super-admin.css` and indicate reuse pressure.

| Shared component | `.soa` source family | Rules | Replaces in workspace |
| --- | --- | --- | --- |
| `Button` | `.btn` (+ variants) | 14 | `Primitives.Button`, `.ad-button` |
| `Dialog` | `.dialog`, `-head`, `-body`, `-foot`, `-close-btn` | 24 | `ui/Dialog`, `Panel(modal)`, `.ad-dialog` |
| `Card` | `.card`, `.card-head`, `.card-body` | 8 | `ui/Card`, `.ad-card`, `.ad-card-heading` |
| `Badge` | `.badge` | 8 | `ui/Badge`, `Primitives.Badge` |
| `StatTile` / `StatsRow` | `.stats`, `.stat`, `.stat-top`, `.stat-ic` | 14 | `ui/StatTile`, `.ad-metric`, `.ad-metrics` |
| `Table` | `.tablecard`, `.tscroll` | 3 | `tables.css` families, `.ad-employees-table` |
| `EmptyState` | `.empty`, `.empty-icon-wrap` | 6 | `ui/EmptyState`, `Primitives.Empty`, `super-admin/EmptyState`, `PlansEmptyState` |
| `Notice` / `ErrorBanner` | `.notice` | 6 | `ui/ErrorBanner`, `AccessNotices` chrome |
| `Tabs` | `.tabs`, `.tab` | 5 | `SubscriptionsShell`, `StoreDetailShell` tab strips |
| `Filters` (`Pill`, `SearchField`) | `.filters`, `.fpill`, `.fsearch`, `.ftools` | 4 | `ui/Pill`, `.ad-filter-row` |
| `KeyValue` | `.kv` | 8 | `.ad-detail-grid`, `.ad-detail-dates` |
| `Dropdown` (multi + single) | `.menu`, `.radio-card` | 13 | `ui/Dropdown` |
| `Toggle` / `Switch` | `.switch`, `.switch-row` | 8 | `ui/Toggle` |
| `Pagination` | `.pg` | 4 | `ui/Pagination`, `.ad-pagination` |
| `Avatar` | `.av` | — | `ui/Avatar`, `.ad-avatar` |
| `IconButton` | `.icon-btn` | 4 | `.ad-icon-button` |
| `RowMenu` | `.menu` + portal logic | 7 | (new to workspace) |
| `Icon` | `Icon.tsx` | — | **retires the emoji glyphs in `AdminChrome`** |
| `PageHeading` | `.phead`, `-l`, `-r`, `-ic` | 5 | `.ad-page-heading` |

### 3.1 App shell — `src/features/shared/ui/AppShell`

`AppShell · Sidebar · Topbar · MobileDrawer · NavItem · Brand`

One implementation, configured per role:

| Prop | Super Admin | Workspace |
| --- | --- | --- |
| `brand` | `StoreOps` / `PLATFORM ADMIN` | **live store name** / `STORE WORKSPACE` |
| `nav` | 7 platform links | role-filtered (owner vs employee) |
| `topbar` | search + `⌘K`, bell, avatar | store switcher, outlet switcher, avatar |
| `footer` | user + `Super Admin` | user + role |

The store name already resolves in `src/app/(workspace)/layout.tsx` via
`resolveStoreSelection` and is passed to `AdminChrome` today — no new data
plumbing. This deletes one of the two mobile-drawer focus-trap implementations.

### 3.2 Components deleted outright

| Deleted | Superseded by |
| --- | --- |
| `Primitives.Badge`, `.Empty`, `.Button` | shared `Badge`, `EmptyState`, `Button` |
| `super-admin/Dialog.tsx` | shared `Dialog` |
| `admin/components/ui/Dialog.tsx` | shared `Dialog` |
| `super-admin/EmptyState.tsx`, `PlansEmptyState.tsx` | shared `EmptyState` |
| `AdminChrome` + `SuperAdminChrome` internals | shared `AppShell` |

`Panel` survives **only** for the two PDF slide-over viewers. The Owner
Workspace 2.0 spec bans side panels for create/edit flows.

**Open question, not assumed:** `InvoicePdfViewer` and `OrderInvoicePdfViewer`
are near-identical, as are `InvoiceActions` and `OrderInvoiceActions`.
`CURRENT-STATE.md` records their separation as a deliberate decision. Flag for a
decision during Phase 6; do not merge silently.

---

## 4. Phase plan

Every phase is **one commit**, green before it lands. No phase spans a commit
boundary. No two people or agents work a phase concurrently.

| # | Phase | Outcome |
| --- | --- | --- |
| 0 | **Toolchain + baseline** | `app.css` with `@import "tailwindcss"` and `@theme`. No other file changes. Capture reference screenshots of every Super Admin screen at 1440 / 768 / 375 — this is the freeze baseline every later phase is checked against. Zero visual change. |
| 1 | **Containment** | Scope `owner-workspace.css` so its nine unscoped classes and its `:root` block stop leaking. Delete the dead marketing body of `globals.css` (~95 lines). **Fixes the reported symptom on its own**, and protects the Super Admin freeze for everything that follows. |
| 2 | **Shared `Icon` + `Button` + `Badge`** | Smallest, highest-reuse primitives. Super Admin refactored onto them; `.soa .btn`/`.badge` deleted. Establishes the extraction pattern and the screenshot-diff workflow. |
| 3 | **Shared `Card`, `StatTile`, `KeyValue`, `PageHeading`, `Notice`** | Layout primitives. |
| 4 | **Shared `Dialog`** | Collapses three implementations into one. Highest-risk single phase — 20+ Super Admin dialogs plus workspace editors. Do it alone. |
| 5 | **Shared `Table`, `EmptyState`, `Filters`, `Pagination`, `Dropdown`, `Toggle`, `RowMenu`** | List-screen primitives. |
| 6 | **Shared `AppShell`** | Both chromes swap onto it. Workspace gains the live store name and real SVG icons. `.ad-sidebar`/`.ad-topbar` and `.soa .side`/`.top` families deleted. |
| 7 | **Products (Catalogue)** | First full workspace screen. |
| 8 | **Orders** (`OrderTable` 249 L, `OrderDetails`) | Largest surface. Retires the `tables.css` detail families (`.ad-detail-*`, `.ad-orders-card`, `.ad-delivery-*`, `.ad-details-header`). `.ad-items-table` is shared with `OrderCart`, so it survives into Phase 9. |
| 9 | **Sales / POS counter** (`OrderCart`, `ServiceGrid`) | `counter.css` and `pos.css` retire in full; `tables.css` retires here, once its cart families (`.ad-cart-*`, `.ad-items-table`, `.ad-counter`) are gone. Its cross-cutting `.ad-root`/`.ad-toast` rules move to teardown. |
| 10 | **Expenses** | |
| 11 | **Employees** | |
| 12 | **Profile + Payment methods** | |
| 13 | **Outlets** | |
| 14 | **Dashboard + charts** | `dashboard.css` retires. |
| 15 | **Remaining Super Admin screens** | Anything not already carried by phases 2–6. |
| 16 | **Teardown** | Delete emptied CSS files; drop the `.soa` and `.ad-root` wrapper divs; remove the last feature CSS that turned out unnecessary. Only when the orphan check reports zero. |

Phase 1 is deliberately front-loaded: it resolves the cross-system bleed
immediately, so the visual inconsistency is fixed even if phases 2+ pause.

---

## 5. Verification gate

Run on **every** phase commit. A phase is not done until all of it passes.

```bash
npx tsc --noEmit --incremental false
npx eslint .
npm run build
LC_ALL=C npm run test:subscription-payments    # 43/43
```

`LC_ALL=C` matters: without it `pg_ctl` fails with "postmaster became
multithreaded during startup" on this machine. The gate was never actually
blocked — it needed a locale.

### 5.1 Mechanical checks — progress must be measured, not claimed

This is the specific control against the previous attempt's failure mode.

1. **Dead-selector grep.** For every selector deleted in the phase, grep `src`
   for references. Must return zero. Record the command and its output.
2. **`scripts/check-css-orphans.mjs`** (new, written in Phase 0). Lists CSS
   selectors with no TSX consumer. Run before and after; the count must strictly
   decrease. Committed as a script so anyone can re-run it.
3. **Line ledger.** Each commit message records `CSS: <before> → <after>` across
   all stylesheets. A file claimed deleted must actually be absent from `git
   show HEAD:<path>`.
4. **Super Admin screenshot diff.** Every phase that touches Super Admin
   compares against the Phase 0 baseline at 1440 / 768 / 375. Any pixel
   difference is a defect, not an improvement.

### 5.2 Workspace behavioural checks

Per `.agents/README.md`, re-verify after the shell and auth-adjacent phases:
signed-out `/` redirects to `/login`; owner sign-in reaches `/`; reload retains
session; signed-in `/login` returns to the role home; logout reaches `/login`;
employee access is independently checked; `AccessBlockedScreen` still renders
with nav and logout reachable.

---

## 6. Deletion ledger

Target end state:

| File | Now | After |
| --- | --- | --- |
| `globals.css` | 101 | deleted, replaced by `app.css` (~120) |
| `owner-workspace.css` | 757 | deleted |
| `super-admin.css` | 496 | deleted |
| `admin.css` | 243 | deleted |
| `tables.css` | 226 | deleted |
| `dashboard.css` | 115 | deleted |
| `counter.css` | 66 | deleted |
| `pos.css` | 40 | deleted |
| feature escape-hatch CSS | — | a few small files (print, `::backdrop`) |
| **Total** | **2,044** | **~150–250** |

Also retired: 452 inline `style={{…}}` blocks, the hardcoded hex literals that
restate tokens, the emoji nav glyphs, and one of the two mobile-drawer
implementations.

---

## 7. Risks

| Risk | Control |
| --- | --- |
| Repeat of the uncommitted-migration failure | One phase per commit; mechanical checks in 5.1; line ledger in the commit message |
| Super Admin regresses while being refactored | Phase 0 screenshot baseline; per-phase diff; Phase 1 containment lands first |
| Half-migrated files leak styles between systems | Phase 1 scopes `owner-workspace.css` before any migration begins |
| Phase 4 (Dialog) breaks many screens at once | Isolated in its own phase; no other work shares that commit |
| `ui/` library is untracked and could be lost | Commit it as-is in Phase 0 before any refactor touches it |
| Tailwind v4 `@theme` unfamiliarity | Phase 0 changes nothing visually, so the toolchain is proven before it carries weight |

---

## 8. Sequencing note for parallel work

If more than one agent works this plan, they take **non-adjacent phases from 7
onward** (the per-screen phases), never phases 0–6, which are shared
foundations. Each rebases before starting and runs the full gate before
committing. Phases 2–6 are strictly sequential.
