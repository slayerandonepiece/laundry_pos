# Prompt for Gemini — Owner Workspace 2.0

Paste the block below to Gemini once the design canvas is shared with
whatever account/session Gemini reads links as (see "Artifact sharing" in
the requirements doc).

---

You're implementing the "Owner Workspace 2.0" redesign in this repo
(laundry_pos — Express Laundry store workspace). Read these first, in order,
before writing any code:

1. `AGENTS.md` and `.agents/README.md` — repo conventions.
2. `.agents/CURRENT-STATE.md` and `.agents/BACKEND-PLAN.md` — what backend
   and current frontend actually exist today. Do not assume the design doc
   below reflects current backend state; verify against these and the real
   code.
3. `.agents/OWNER-WORKSPACE-2.0-REQUIREMENTS.md` — the module-by-module
   requirements for this redesign, written against the design canvas below.
   Read it fully before starting. It calls out 4 open questions near the
   end — resolve them with the owner before implementing the affected parts
   (Expense outlet cardinality, Outlet-Detail chart choice, the
   CURRENT-STATE.md multi-outlet contradiction, and artifact access).

Design canvas (source of truth for visuals, spacing, copy):
https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv
It's a Design-canvas artifact — one `.dc.html` file per screen, named
exactly as referenced in the requirements doc's "Design reference" line for
each module. `project/shared.css` inside it is the literal design-token/
component spec (colors, spacing, the shared component classes).

The owner is also exporting the canvas's screens as static HTML files and
will add them to this repo (likely under `.agents/design-export/` or similar
— check for a folder like that, or ask if you can't find it) as a fallback
in case the artifact link itself isn't reachable from where you're working.
If both exist, treat the live artifact link as authoritative for anything
that differs, since the export is a point-in-time snapshot.

First, make your own checklist:
- Read the 3 docs above, then write out a literal checklist covering every
  module in the requirements doc's order (Dashboard, Products, Orders,
  Expenses, Employees, Profile, Outlets) plus the §0 reusable components as
  their own line item (build once, before or alongside the first module that
  needs one).
- Post that checklist back to the owner before writing any code, so they can
  correct it if a module or component is missing or ordered wrong.
- Work through it top to bottom, one item at a time. Mark an item done only
  after it's implemented, matches the named `.dc.html` screen(s), and you've
  said so in chat — don't silently batch multiple modules into one pass.
- If a module turns out to need something not in the checklist (e.g. a new
  shared component you didn't anticipate), add it to the checklist and flag
  the addition rather than quietly expanding scope.

Ground rules:
- Build the reusable components in requirements §0 (`Dialog`,
  `MultiSelectDropdown`, `SingleSelectDropdown`, `Card`, `StatTile`, `Badge`,
  `Tag`, `Pill`, `OutletSwitcher`, `Toggle`, `Pagination`, `Avatar`,
  `EmptyState`, `ErrorBanner`, `ShimmerRow`, `Sentinel`) once, as real shared
  components — not per-screen copies. Every module in the requirements doc
  lists exactly which of these it uses.
- Every create/edit flow is a centered `Dialog` — no side-nav panels
  anywhere, matching `SharedListStates.dc.html`'s and the requirements doc's
  pattern.
- Every list screen implements the same Loading/Empty/Error pattern from
  `SharedListStates.dc.html` (row-height skeletons; empty state copy that
  distinguishes first-use from filtered-empty; an inline top-of-screen error
  banner with Retry, never a popup, for load failures).
- Do not touch Sales — it's explicitly out of scope for this pass (see
  requirements §3).
- Work module by module in the order the requirements doc lists them
  (Dashboard, Products, Orders, Expenses, Employees, Profile, Outlets), and
  check in after each module rather than building all of them before any
  review.
- Preserve everything `CURRENT-STATE.md` documents as already
  backend-verified (auth, session scoping, `DailyOutletSummary` aggregation,
  `dashboardData()`, etc.) — this is a UI/component redesign on top of
  existing data flows, not a backend rewrite. Where a screen needs backend
  that doesn't exist yet, say so instead of stubbing it silently.

If anything in the design canvas conflicts with `CURRENT-STATE.md`'s actual
implemented behavior, or a requirement is ambiguous, stop and ask rather
than guessing.
