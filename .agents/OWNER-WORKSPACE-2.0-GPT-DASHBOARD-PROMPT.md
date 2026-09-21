# Prompt for GPT (Astra) — Owner Workspace 2.0, Dashboard only

Paste the block below into GPT. Scope is deliberately narrowed to **Dashboard
only** — Products/Orders/Employees/Profile/Outlets were already attempted
(by Gemini) and shipped, but the owner has reviewed the result and it does
**not** match the design canvas — it's described as "horrible" and "not even
close." Do not touch those 5 modules in this pass. Dashboard is the pilot to
prove the process actually produces a pixel-accurate result before any other
module is touched again.

---

You're redesigning the **Dashboard** screen only, in this repo (laundry_pos —
Express Laundry store workspace), against a design canvas. A previous attempt
at this whole effort (by a different AI) already shipped Products, Orders,
Employees, Profile, and Outlets — the owner has looked at the live result and
it does not visually match the design canvas at all. Your job on Dashboard is
to get it **pixel-accurate**, not "in the spirit of." Read before writing any
code:

1. `AGENTS.md` and `.agents/README.md` — repo conventions.
2. `.agents/CURRENT-STATE.md` and `.agents/BACKEND-PLAN.md` — what backend and
   current frontend actually exist today. Verify against these and the real
   code, not just the design doc — don't assume Dashboard's current data
   plumbing is wrong just because its visuals are; the multi-outlet backend
   (`dashboardData()`, `resolveStoreSelection`, per-outlet aggregation) is
   real and already verified. This is a **visual/markup/CSS pass on top of
   existing data flows**, not a data rewrite.
3. `.agents/OWNER-WORKSPACE-2.0-REQUIREMENTS.md` — the Dashboard module's
   requirements section specifically (read the whole doc for context, but
   Dashboard is your only scope this pass).

You must use this repo's own tooling — do not skip either of these in favor
of raw file reads/greps:
- **graft**: `graft ask "<question>" --source` for understanding how the
  current Dashboard is wired (data fetch, `dashboardData()`, `AdminChrome`,
  existing components it already uses), `graft skeleton <file>` to skim a
  file's API surface before opening it whole, `graft callers <symbol>` to
  find what calls into a piece before changing its signature.
- **project wiki** (via the `wiki:query` skill, read-only): consult it for
  any onboarding/architecture question it might already answer before
  guessing.

**Design canvas** (source of truth — pixel values, not vibes):
https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv
Open these two artboards specifically:
- `Dashboard-SingleOutlet.dc.html` — single-outlet view, no outlet dropdown.
- `Dashboard-AllOutlets.dc.html` — the "All outlets" aggregate view (only
  reachable when the owner has more than one outlet and picks "All outlets").

`project/shared.css` inside that same canvas is the literal design-token
spec — exact colors, spacing scale, radii, font sizes/weights, shadow values.
**Read the actual CSS custom properties and class rules from `shared.css`
and copy the real values** — do not approximate a color as "a similar blue"
or a spacing as "about 16px." If a token exists in `shared.css` for something
Dashboard uses, use that token, not a guessed literal.

A static HTML export of the same canvas also exists in this repo at
`.agents/design-export/` as a fallback if the live artifact link isn't
reachable from where you're working — if both exist, the live link wins on
any difference, since the export is a point-in-time snapshot.

## Why the last attempt failed (read this before starting)

The owner's exact words: the previous pass's Dashboard/Products/Orders/
Employees/Profile/Outlets output was "horrible & not even close to design."
Concretely, avoid these failure modes:
- **Building your own layout "inspired by" the screenshot** instead of
  reading the `.dc.html` file's actual DOM structure and `shared.css`
  classes and reproducing them directly. The `.dc.html` files are real HTML
  — open them, read the markup and applied classes, don't reverse-engineer
  from a mental image of "what a dashboard usually looks like."
  it's an actual design vs re-implementation from your side, not a template.
- **Reinventing components that already exist in this repo.** Check
  `src/features/admin/components/` for `Card`, `StatTile`, `Badge`, `Tag`,
  `Pill`, `EmptyState`, `ErrorBanner`, `ShimmerRow` and any shared list-state
  pattern before writing new markup — Dashboard should compose the existing
  shared components (per the requirements doc's §0 component table), styled
  to match the canvas, not hand-rolled one-off divs.
- **Skipping self-verification.** Before reporting Dashboard done, actually
  compare your rendered result against the canvas artboard side by side —
  same spacing, same stat-tile order, same colors in both light states shown
  (single-outlet vs all-outlets), same empty/loading states as
  `SharedListStates.dc.html` defines them. If you cannot visually compare
  (no screenshot capability), describe explicitly, element by element, how
  your markup/CSS maps to the canvas's markup/CSS, so the owner can verify
  instead of just being told "done."

## Ground rules

- Preserve everything `CURRENT-STATE.md` documents as already
  backend-verified for Dashboard (`dashboardData()`, the "All outlets"
  aggregation added in the 2026-09 multi-store item, `resolveStoreSelection`)
  — this is UI/component work on top of existing data, not a backend rewrite.
- Reuse `AdminChrome`'s existing sidebar/topbar shell — don't rebuild chrome
  that already exists and is out of scope for this pass.
- If the design canvas conflicts with `CURRENT-STATE.md`'s actual implemented
  behavior, or something in the requirements doc is ambiguous, stop and ask
  rather than guessing — a wrong guess here repeats the exact mistake that
  made the last pass unusable.
- When done, report back explicitly against the two named `.dc.html` files,
  not just "Dashboard is updated."

Design canvas link to share with the owner once done, so they can compare:
https://claude.ai/artifact/LYcrggHMjgU8asZ68mJnQv
