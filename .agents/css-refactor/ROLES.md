# Agent roles

Model choice tracks risk, not phase size. Anything that can silently move Super
Admin's rendered output, or that touches many files through one shared
abstraction, goes to Opus. Mechanical per-screen conversion against an
already-proven component library goes to Sonnet.

| Role | Model | Phases | Why this model |
| --- | --- | --- | --- |
| **Foundation** | Opus | 0, 1 | Phase 0 sets the token contract every later phase inherits; Phase 1's scoping decisions determine whether the freeze holds. A wrong call here is invisible until phase 9. |
| **Library architect** | Opus | 2, 3, 5 | Extracting a component from `.soa` means deciding which of its 8–24 rules are API and which are incidental. Judgement-heavy, and every screen phase depends on the answer. |
| **Dialog specialist** | Opus | 4 | Three implementations into one across 20+ Super Admin dialogs plus workspace editors. Highest blast radius of any single phase. |
| **Shell architect** | Opus | 6 | Unifies two chromes, two focus traps, and role-driven nav. Auth-adjacent: `AccessBlockedScreen` must keep nav and logout reachable. |
| **Screen migrator** | Sonnet | 7–14 | Library exists and is proven; work is applying it screen by screen against a fixed reference. Parallel-capable, one worktree each. |
| **Closeout** | Opus | 15, 16 | Teardown deletes files permanently; needs the orphan check read correctly, not optimistically. |
| **Verifier** | Sonnet | gate on every phase | Runs the four gate commands and the §5.1 mechanical checks, reports pass/fail verbatim. Deliberately separate from the agent that wrote the code. |

## Spawning rules

- **Never** two agents in the same phase.
- **Never** parallel agents on phases 0–6 — they share foundations, and the
  2026-09-18 attempt died from exactly this (parallel agents, shared tree, no
  per-step commits, self-reported progress).
- Phases 7–14 may run in parallel **only** in separate git worktrees
  (`isolation: "worktree"`), taking non-adjacent phases.
- Phase 9 lands after Phase 8: `tables.css` families are shared between
  `OrderDetails` and `OrderCart`.
- Every agent's prompt names its phase file and `PROTOCOL.md`. No agent is given
  context verbally that isn't also written down.
