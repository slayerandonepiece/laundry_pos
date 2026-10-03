# Express Laundry — agent entry point

This is the frontend store workspace, not the public marketing website.
Before working, read the shared instructions and project context:

1. [.agents/README.md](.agents/README.md) — scope, conventions and validation.
2. [.agents/CURRENT-STATE.md](.agents/CURRENT-STATE.md) — implemented frontend,
   routes, source map and browser-storage limitations.
3. [.agents/BACKEND-PLAN.md](.agents/BACKEND-PLAN.md) — remaining backend work
   inside this Next.js app; a plan, not implemented functionality.
4. StoreOps Super Admin implementation plans (frontend + backend, not yet
   built) — [.agents/STORES-IMPLEMENTATION.md](.agents/STORES-IMPLEMENTATION.md),
   [.agents/USERS-IMPLEMENTATION.md](.agents/USERS-IMPLEMENTATION.md),
   [.agents/SUBSCRIPTIONS-IMPLEMENTATION.md](.agents/SUBSCRIPTIONS-IMPLEMENTATION.md).

These files are the shared source of truth for Codex/GPT, Claude and Gemini.
Keep them current when architecture, routes, permissions or persistence change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

5. [.agents/MOBILE-API-TASKS.md](.agents/MOBILE-API-TASKS.md) — the mobile HTTP API
   task list (Phase 1 of the Flutter app work). No API exists today; read
   this before adding any route handler.
6. [.agents/OWNER-WORKSPACE-2.0-REQUIREMENTS.md](.agents/OWNER-WORKSPACE-2.0-REQUIREMENTS.md) —
   module-by-module requirements for the redesigned owner/employee workspace
   (Dashboard, Products, Orders, Expenses, Employees, Profile, Outlets),
   with design-canvas references and a reusable component list. Design only,
   not implemented — read this before building any of those screens.
