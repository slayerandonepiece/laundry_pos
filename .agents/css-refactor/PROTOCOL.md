# CSS refactor — execution protocol

This directory is the **only** shared state between agents. It is designed so any
agent (or a fresh session after a context reset) can resume cold by reading three
files and nothing else:

1. `STATUS.md` — which phase is where, who holds it, what landed.
2. `phases/P<NN>.md` — the self-contained brief for the phase being worked.
3. `../CSS-THEME-REFACTOR-PLAN.md` — the design spec (read-only, do not edit).

No knowledge is allowed to live only in an agent's context window. If it matters,
it is written to `STATUS.md` or the phase file's Handoff log before the agent
does anything else.

## Non-negotiable rules

1. **One phase = one agent = one commit.** Never two agents in one phase.
2. **Claim before work.** Set the phase row in `STATUS.md` to `IN_PROGRESS` with
   your agent name and commit that edit *first*. If the row is already
   `IN_PROGRESS` and not yours, stop and report.
3. **Phases 0–6 are strictly sequential.** Do not start phase N until N-1 reads
   `DONE` in `STATUS.md`.
4. **Search with graft, not grep-first.** See the graft block below.
5. **The verification gate runs before every commit.** A phase is not `DONE`
   until all four commands pass and the mechanical checks in §5.1 of the plan
   are recorded in the phase file.
6. **Super Admin's rendered UI is frozen.** Any pixel change vs. the Phase 0
   baseline is a defect. Code may be refactored; output may not move.
7. **Append, never rewrite, the Handoff log.** It is the audit trail.
8. **If blocked, write the blocker into the phase file and set `BLOCKED`.**
   Do not improvise around a blocker, and do not silently narrow scope.
9. **Commit by explicit path, always: `git commit -- <path> [<path>…]`.**
   A bare `git commit` commits the *entire index*, including anything someone else
   staged. On 2026-09-21 commit `caf8f79` ("docs(css-refactor): …", meant to hold one
   markdown file) swept in 91 files of other people's staged in-flight work this way.
   Run `git diff --cached --name-only` before committing; if it lists anything that
   isn't yours, the pathspec form is mandatory, not optional.

## Search protocol (graft)

Always start here. Never open a whole file.

```bash
graft ask "<question>" --source          # ranked nodes + inlined code spans
graft grep "<literal>"                   # exhaustive, grouped by symbol — use for
                                         # "every consumer of .stat-tile" questions
graft skeleton <file>                    # API surface, ~10x cheaper than reading
graft callers <symbol> --depth 2         # blast radius before a rename/delete
```

`graft grep` is the correct tool for the dead-selector check in §5.1 — ranked
`ask` results are top-N and will under-report. Refresh with `graft build` after a
phase lands.

## Verification gate (every phase commit)

```bash
npx tsc --noEmit --incremental false
npx eslint .
npm run build
LC_ALL=C npm run test:subscription-payments    # 43/43 — LC_ALL=C is required
```

Plus, recorded in the phase file:
- dead-selector `graft grep` output for every deleted selector — must be zero
- `node scripts/check-css-orphans.mjs` before/after — count must strictly decrease
- CSS line ledger `CSS: <before> → <after>` in the commit message
- Super Admin screenshot diff vs. the Phase 0 baseline (phases touching `.soa`)

## Commit message format

```
css(phase-<NN>): <short title>

CSS: <before> → <after> lines
Deleted: <selectors/files>
Gate: tsc ok, eslint ok, build ok, tests 43/43
Orphans: <before> → <after>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Constraints inherited from the repo

- `.agents/README.md`: preserve unrelated work and the website extraction; do not
  reset or overwrite staged changes. The working tree already carries substantial
  uncommitted work on `chore/backend-and-setup` — rebase, never reset.
- Never read or copy `.env.local` values anywhere.
- No functional change: no new props, routes, permissions, queries or copy.
