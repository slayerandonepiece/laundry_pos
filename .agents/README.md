# Shared agent guidance

Read this file, `CURRENT-STATE.md`, and `BACKEND-PLAN.md` before changing this project.
These are shared project instructions for Codex/GPT, Claude, and Gemini. Root
`AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` point here; `.agents` by itself is not
assumed to be automatically discovered by every tool.

## Scope and working conventions

- This repository is the Express Laundry store workspace. The customer-facing
  website was extracted into the sibling `vendor_websites/express-laundry` folder.
  Do not restore the marketing website into this app or mix the two projects.
- The core backend migration (Postgres/Prisma, real auth, all screens
  server-backed) is complete — see `BACKEND-PLAN.md`'s status line and
  `CURRENT-STATE.md`. The app is now mid-migration to multi-tenancy
  (StoreOps): schema, auth, and the Super Admin onboarding UI are done;
  subscription-lock enforcement and invoice generation are not yet built.
  Treat further phases as planned, not implemented, until `CURRENT-STATE.md`
  says otherwise.
- Inspect the current working tree, staged changes, and relevant source before
  editing. Preserve unrelated work and the website extraction. Do not reset or
  overwrite staged changes. Source code wins if these notes have become stale;
  update the notes when behavior changes.
- Use TypeScript and the existing component/container split: components render UI;
  containers handle interaction and state. Keep shared domain calculations in
  focused modules. Thin route pages choose screens.
- Keep `/` as the owner dashboard and `/login` as the canonical login route.
  Employees use New sale and Sales register within Sales and land at `/admin/sales`.
  The legacy `/admin/orders` page redirects to Sales; order APIs/PDF routes remain.
- Preserve the current visual design, responsive layouts, keyboard interactions,
  loading/error states, confirmation dialogs, INR formatting, and IST reporting.
- Before Next.js implementation, read relevant bundled documentation in
  `node_modules/next/dist/docs/`. The installed version may differ from familiar
  Next.js releases. Consult package.json and lockfile for actual dependencies.
- Do not read or copy `.env.local` values into documentation, logs, client bundles,
  or prompts. Document only environment variable names when integrations exist.
- No browser credentials, role values, prices, or permissions are authoritative
  for production. Keep backend-only code outside client dependency graphs.

## Local commands and validation

Run from this repository: `npm install`, `npm run dev` (normally localhost:3000).
Use `npm run lint` and `npx tsc --noEmit` for code changes; use `npm run build`
for routing/server/dependency changes when appropriate. Do not run a production
build against a dev server's active `.next` output without coordinating it.
The focused `npm run test:subscription-payments` integration regression requires
local PostgreSQL binaries; see `tests/README.md`. No full test suite exists yet.

For route/auth changes, verify signed-out `/` reaches `/login`, owner sign-in
reaches `/`, reload retains the session, signed-in `/login` returns to the role's
home, logout reaches `/login`, and legacy URLs redirect. Verify employee access
independently when changing permissions. Check desktop and mobile for UI changes.
For backend work add meaningful domain, authorization, integration, and browser
flow tests; do not treat lint alone as behavioral validation.

Keep `CURRENT-STATE.md` factual. Mark backend milestones complete only after
implementation and verification. Report what changed, checks run, and remaining
limits. Documentation-only edits need link/content checks, not application tests.

Invoice primitives are shared in `src/lib/pdf/InvoiceLayout.tsx` and
`src/lib/pdf/response.tsx`; browser preview/print/share live in
`src/components/PdfPreview.tsx`, `src/lib/invoicePrint.ts` and
`src/lib/invoiceShare.ts`. Keep authorization in each existing route/service.
Order detail mutations share `src/features/admin/containers/useOrderMutation.ts`
and the busy overlay in `Panel`, including failures and route refreshes.
