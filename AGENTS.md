# Express Laundry — agent entry point

This is the frontend store workspace, not the public marketing website.
Before working, read the shared instructions and project context:

1. [.agents/README.md](.agents/README.md) — scope, conventions and validation.
2. [.agents/CURRENT-STATE.md](.agents/CURRENT-STATE.md) — implemented frontend,
   routes, source map and browser-storage limitations.
3. [.agents/BACKEND-PLAN.md](.agents/BACKEND-PLAN.md) — remaining backend work
   inside this Next.js app; a plan, not implemented functionality.

These files are the shared source of truth for Codex/GPT, Claude and Gemini.
Keep them current when architecture, routes, permissions or persistence change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
