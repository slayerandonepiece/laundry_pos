# Prompt for Antigravity — Owner Workspace 2.0 (parallel agents)

Paste the block below into Antigravity. It's written for a lead/orchestrator
agent that spins up one parallel sub-agent per reusable-component library and
one per module.

---

You're implementing the "Owner Workspace 2.0" redesign in this repo
(laundry_pos — Express Laundry store workspace), using **parallel sub-agents**,
one per work item below. Before spinning up any sub-agent, read yourself,
and require every sub-agent to read at the start of its own run:

1. `AGENTS.md` and `.agents/README.md` — repo conventions.
2. `.agents/CURRENT-STATE.md` and `.agents/BACKEND-PLAN.md` — what backend and
   current frontend actually exist today. Verify against these and the real
   code, not just the design doc.
3. `.agents/OWNER-WORKSPACE-2.0-REQUIREMENTS.md` — the module-by-module
   requirements this whole effort is built against.

Every sub-agent must also follow this repo's own working conventions from
`AGENTS.md`: use **graft** (`graft ask "<question>" --source`, `graft skeleton
<file>`, `graft callers <symbol>`) to get context before grepping or opening
source files, and consult the project **wiki** (via the `wiki:query` skill,
read-only) for any onboarding/architecture question it might already answer.
Do not skip these in favor of raw file reads/greps — that's what the tooling
is there to avoid.

**Design canvas** (source of truth for visuals, spacing, copy):
https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv
One `.dc.html` file per screen, named exactly as in the requirements doc's
"Design reference" lines. `project/shared.css` is the literal design-token/
component spec. A static HTML export of the same canvas is also being added
to the repo (check for `.agents/design-export/`) as a fallback if the live
link isn't reachable — the live link wins on any difference.

**Resolved decisions** (don't re-ask these):
- Expense "Applies to" resolves to **one outlet or organization-wide** —
  no multi-outlet-per-expense schema change. If the design canvas's
  multi-select widget is reused here, constrain it to single-selection
  behavior for this screen, or use `SingleSelectDropdown` instead.
- Outlet-Detail's earnings-vs-expenses widget ships as the **donut**
  (`Outlet-Detail-Alt.dc.html`) — treat it as the canonical Outlet-Detail
  screen; the bars version (`Outlet-Detail.dc.html`) is retired.
- The multi-outlet backend (schema + Tasks B1–B6) is real and already
  verified — this whole effort is UI/component work on top of it, not a
  backend rewrite.

## Sub-agent split

Spin these up to run **in parallel**:

- **Agent 0 — Reusable component library (§0).** Owns building
  `Dialog`, `MultiSelectDropdown`, `SingleSelectDropdown`, `Card`,
  `StatTile`, `Badge`, `Tag`, `Pill`, `OutletSwitcher`, `Toggle`,
  `Pagination`, `Avatar`, `EmptyState`, `ErrorBanner`, `ShimmerRow`,
  `Sentinel`, and the shared Loading/Empty/Error list pattern from
  `SharedListStates.dc.html`, as real shared components — not per-screen
  copies. This agent is the **only one allowed to edit these components
  directly.**
- **Agent 1 — Dashboard** (`Dashboard-AllOutlets.dc.html` +
  single-outlet view)
- **Agent 2 — Products** (`Products-List.dc.html`, `ProductEditDialog.dc.html`)
- **Agent 3 — Orders** (`Orders-Desktop.dc.html`, `Orders-Mobile.dc.html`)
- **Agent 4 — Expenses** (`Expenses-List.dc.html`, `ExpenseEditDialog.dc.html`)
- **Agent 5 — Employees** (`Employees-List.dc.html`, `EmployeeCreateDialog.dc.html`)
- **Agent 6 — Profile** (`Profile.dc.html`)
- **Agent 7 — Outlets** (`Outlets-List.dc.html`, `Outlet-Detail-Alt.dc.html`)

Sales is explicitly **out of scope** — no agent touches it.

## Coordination rules

- Module agents (1–7) consume the components Agent 0 builds; they do **not**
  edit shared component files themselves. If a module agent finds a shared
  component is missing a variant/prop it needs, it must **stop and hand that
  requirement to Agent 0** (describe the exact prop/behavior needed and which
  screen needs it) rather than patching the component inline or forking a
  local copy. Agent 0 makes the change, then the module agent resumes.
- Because module agents depend on Agent 0's output, either (a) let Agent 0
  land the initial component set first and start module agents once it's
  usable, or (b) start all agents together but have module agents build
  against the components' intended interface from the requirements doc's §0
  table and reconcile once Agent 0's real implementation lands — pick
  whichever your runtime supports; note the choice when you report back.
- Every create/edit flow is a centered `Dialog` — no side-nav panels.
- Every list screen implements the `SharedListStates.dc.html` Loading/Empty/
  Error pattern via Agent 0's shared components, not a reimplementation.
- Each agent checks in (reports what it built, against which `.dc.html`
  file(s)) when its module is done, rather than everything landing silently
  at once.
- If anything in the design canvas conflicts with `CURRENT-STATE.md`'s actual
  implemented behavior, or a requirement is ambiguous, that agent stops and
  asks rather than guessing — don't let one agent's guess silently become the
  shared assumption for the others.
