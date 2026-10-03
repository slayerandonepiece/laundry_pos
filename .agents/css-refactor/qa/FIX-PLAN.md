# QA fix round — ownership plan (read-only for agents)

Written 2026-09-21. Bugs are defined in `BUGS.md` (same folder); full evidence in
`desktop.md` / `mobile.md`. Four agents work **in parallel in the same working tree**,
so file ownership below is strict.

Owner decisions already made (2026-09-21):
- Multi-selects must be "proper" and use the shared component — **no duplicated
  one-off controls**. The shared one is `MultiSelectDropdown` / `SingleSelectDropdown`
  in `src/features/admin/components/ui/Dropdown.tsx`.
- Follow standard UI/UX conventions. That settles **P-01**: example slab prices become
  **placeholders**, never pre-filled values.

## File ownership — edit ONLY files you own

| Agent | Bugs | Owns (may edit) |
|---|---|---|
| **A — Dropdowns** | Q-03, Q-05, Q-12, multi-select audit | `ui/Dropdown.tsx`, `ui/OutletSwitcher.tsx`, `ExpenseEditor.tsx`; in `owner-workspace.css` only `.dropdown-*` and `.switcher-*` rules |
| **B — Employees** | Q-01 (S1), Q-06 | `EmployeeEditor.tsx`, `Employees.tsx`; in `owner-workspace.css` only rules for Employees markup you add |
| **C — Orders/Sales + chrome** | Q-02, Q-04, Q-09, Q-13 | `tables.css`, `OrderDetails.tsx`, `OrderDeliveryDetails.tsx`, `OrderTable.tsx`, `Sales.tsx`, `AdminChrome.tsx`; in `admin.css` only topbar/avatar rules |
| **D — Screens polish** | Q-07, Q-08, Q-10, Q-11, Q-14, P-01 | `OutletsList.tsx`, `Dashboard.tsx`, `DashboardCharts.tsx`, `dashboard.css`, `Catalogue.tsx`, `ProductEditorContainer.tsx`, `Profile.tsx`, `Expenses.tsx`; in `owner-workspace.css` only `.pill` / outlet-list / catalogue rules |

All paths are under `src/features/admin/components/` or `src/app/(workspace)/admin/`.

- Need a change in a file you don't own? **Don't make it.** Write it into your report
  under "Cross-agent requests" and carry on.
- Shared stylesheets (`owner-workspace.css`, `admin.css`) are edited by more than one
  agent. **Read the exact region immediately before every Edit**, touch only your
  selectors, and never reformat or reorder the file. If an Edit fails because the file
  changed, re-read and retry — never overwrite.
- You may **use** any component (e.g. B and C consume `MultiSelectDropdown`), just not
  edit one you don't own. Agent A is fixing the component itself.

## Rules for everyone
- Code search: **graft first** — `graft ask "<q>" --source`, `graft grep "<literal>"`
  (exhaustive), `graft skeleton <file>`, `graft callers <symbol>`. Ignore `scratch/`.
- The tree holds **uncommitted work from the Gemini lane in 15 files** (several are
  owned above). Build on it; never revert it. **Do not commit, stage, stash, reset,
  checkout or clean anything.** The parent reviews and commits.
- Super Admin is frozen: nothing under `src/app/super-admin/` or
  `src/features/super-admin/`. Do not touch `src/app/app.css` (finding F2).
  No Tailwind utility classes. No new dependencies.
- Never read `.env*`. Don't start or kill the dev server (already on :3000).
- Gate before you finish: `npx tsc --noEmit --incremental false` and `npx eslint .`.
  Record counts before you start and after; the bar is **no new errors in files you
  touched** (the pre-existing errors are finding F1).

## Browser testing — shared owner session
- Built-in browser tools. First call `tabs_create` and use only your own `tabId`.
  Never act on tab `seed`. Close your tab at the end.
- **Never click Log out** — all tabs share one session cookie.
- Verify at the widths the bug was reported at, plus one desktop and one mobile width
  (`resize_window` on your tab). Prefer DOM measurement over screenshots; one
  screenshot per fixed bug as evidence is enough.
- Writes: avoid them. Where a fix can only be proven by saving (Agent B, Q-01), the
  brief says exactly what is allowed.

## Report
Write `qa/fix-<A|B|C|D>.md` (your own file only):
per bug — status (fixed / not fixed / blocked), files:lines changed, root cause,
before → after measurement, how you tested; then gate counts before/after,
cross-agent requests, anything new you found (don't fix it — list it).
