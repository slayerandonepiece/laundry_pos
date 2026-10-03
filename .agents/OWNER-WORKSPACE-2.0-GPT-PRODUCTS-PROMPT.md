# Prompt for GPT (Astra) — Owner Workspace 2.0, Products only

Paste the block below into GPT. Dashboard (piloted with GPT/Astra) is done and
matches the canvas. Scope for this pass is **Products only**. Do not touch
Sales — the requirements doc explicitly excludes it from this whole redesign
("No screen in this design pass — out of scope... do not redesign it as part
of this handoff"), so there is no artboard for it and it must not be touched.
Do not touch Orders/Employees/Profile/Outlets either — those are separate,
later passes.

---

You're redesigning the **Products** screen only (`/admin/products`, the
"Service catalogue"), in this repo (laundry_pos — Express Laundry store
workspace), against a design canvas. Dashboard was already redone this way
and confirmed to match. Your job on Products is the same bar: **pixel-accurate**,
not "in the spirit of." Read before writing any code:

1. `AGENTS.md` and `.agents/README.md` — repo conventions.
2. `.agents/CURRENT-STATE.md` and `.agents/BACKEND-PLAN.md` — what backend and
   current frontend actually exist today. The product/catalogue backend
   (`src/server/services/products.ts`, org-scoped — a `Product` has no
   `outletId`, so a change applies at every outlet) is real and already
   verified. This is a **visual/markup/CSS pass on top of existing data
   flows**, not a data rewrite.
3. `.agents/OWNER-WORKSPACE-2.0-REQUIREMENTS.md` — read §0 (reusable
   components, applies to every module) and §2 (Products) specifically.

You must use this repo's own tooling — do not skip either of these in favor
of raw file reads/greps:
- **graft**: `graft ask "<question>" --source` for understanding how Products
  is currently wired (`src/app/(workspace)/admin/products/page.tsx`, the
  `Catalogue` and product-editor components, `ProductEditorContainer`),
  `graft skeleton <file>` to skim a file's API surface before opening it
  whole, `graft callers <symbol>` to find what calls into a piece before
  changing its signature. Use targeted queries — don't re-read whole files
  graft can already answer from.
- **project wiki** (via the `wiki:query` skill, read-only): consult it for
  any onboarding/architecture question it might already answer before
  guessing.

**Design canvas** (source of truth — pixel values, not vibes):
https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv
Open these two artboards specifically:
- `Products-List.dc.html` — the catalogue list screen (search, Grid/List
  toggle, table, info banner about services being org-wide).
- `ProductEditDialog.dc.html` — the create/edit dialog, including its dynamic
  pricing-slabs list.

`project/shared.css` inside that same canvas is the literal design-token
spec — exact colors, spacing scale, radii, font sizes/weights, shadow values.
**Read the actual CSS custom properties and class rules from `shared.css`
and copy the real values** — do not approximate a color as "a similar blue"
or a spacing as "about 16px." If a token exists in `shared.css` for something
Products uses, use that token, not a guessed literal.

A static HTML export of the same canvas also exists in this repo at
`.agents/design-export/` as a fallback if the live artifact link isn't
reachable from where you're working — if both exist, the live link wins on
any difference, since the export is a point-in-time snapshot.

## What Products must actually do (from the requirements doc, §2)

- **List**: search box, a Grid/List `Pill` toggle (this is a **view-mode**
  toggle only — it does not filter data, it just changes how the same rows
  render), and a table with columns ID / Service / Category / Pricing /
  Status / Edit. An inline info-styled `ErrorBanner` (tint background, not a
  load-failure banner) states that services are organization-wide — a change
  applies at every outlet, not one branch. This isn't new copy to invent —
  it must literally reflect the real backend contract (no `outletId` on
  `Product`).
- **Edit dialog**: use the shared `Dialog` component (centered, native
  `<dialog>`-style, **not wide**, per §0's component table — every create/
  edit flow in this whole redesign uses `Dialog`, never a side panel).
  Fields: name, category, charging type, and **pricing slabs as a dynamic
  list** — each slab row has its own remove (✕) control, plus a
  "＋ Add price slab" action below the rows. This explicitly replaces
  whatever fixed-2-row layout may currently exist — slabs must be freely
  addable/removable, not capped.
  - Active/inactive toggle row.
  - Inline field-error text for an invalid price (not a dialog-wide error
    banner — see the list-state rules below for the distinction).
- **List states** (`SharedListStates.dc.html`, §0): Loading = row skeletons
  (`ShimmerRow`) at the real row height, no layout jump. Empty = icon +
  heading + one line + a primary action, and it **must** distinguish
  first-use-empty ("no services yet") from filtered-empty ("no results for
  this search") — same layout, different copy. Error = inline banner + Retry
  at the top of the screen, stale rows dim underneath rather than
  disappearing; a dialog only shows an error for its own save/submit
  failure, never for a list-load failure.
- **Reuse shared components** from §0's table — `Dialog`, `Card`, `Badge`
  (Active/Inactive status), `Pill` (grid/list toggle), `EmptyState`,
  `ErrorBanner`, `ShimmerRow` — check `src/features/admin/components/` for
  what already exists before writing any new one-off markup.

## Why the last attempt failed (read this before starting)

The owner's exact words on the prior (Gemini) pass across Products and every
other module attempted so far: "horrible & not even close to design."
Concretely, avoid these failure modes:
- **Building your own layout "inspired by" a screenshot** instead of reading
  the `.dc.html` file's actual DOM structure and `shared.css` classes and
  reproducing them directly. Open `Products-List.dc.html` and
  `ProductEditDialog.dc.html`, read the real markup and applied classes —
  don't reverse-engineer from a mental image of "what a product table
  usually looks like." It's an actual design to copy, not a vague template.
- **Reinventing components that already exist in this repo.** Check
  `src/features/admin/components/` for `Dialog`, `Card`, `Badge`, `Pill`,
  `EmptyState`, `ErrorBanner`, `ShimmerRow` before writing new markup —
  Products should compose these, styled to match the canvas, not hand-rolled
  one-off divs.
- **Skipping self-verification.** Before reporting Products done, actually
  compare your rendered result against the two named artboards side by side
  — same spacing, same table columns, same colors, same empty/loading/error
  states as `SharedListStates.dc.html` defines them, same dialog behavior
  (not wide, dynamic slab rows). If you cannot visually compare (no
  screenshot capability), describe explicitly, element by element, how your
  markup/CSS maps to the canvas's markup/CSS, so the owner can verify instead
  of just being told "done."

## Ground rules

- Preserve everything `CURRENT-STATE.md` documents as already
  backend-verified for Products (`products.ts`'s service functions,
  zod validation, org-wide scoping) — this is UI/component work on top of
  existing data, not a backend rewrite.
- Reuse `AdminChrome`'s existing sidebar/topbar shell — don't rebuild chrome
  that already exists and is out of scope for this pass.
- **Do not touch `/admin/sales`.** It is explicitly out of scope for this
  entire redesign effort per the requirements doc §3 — no artboard exists
  for it, and building one from scratch is exactly the "inspired by, not
  copied from a real design" failure mode this process exists to prevent.
- If the design canvas conflicts with `CURRENT-STATE.md`'s actual implemented
  behavior, or something in the requirements doc is ambiguous, stop and ask
  rather than guessing — a wrong guess here repeats the exact mistake that
  made the last pass unusable. (This happened once already on Dashboard —
  the owner resolved it by treating the written requirements doc as
  authoritative over an out-of-sync artboard. Same rule applies here.)
- When done, report back explicitly against the two named `.dc.html` files,
  not just "Products is updated."

Design canvas link to share with the owner once done, so they can compare:
https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv
