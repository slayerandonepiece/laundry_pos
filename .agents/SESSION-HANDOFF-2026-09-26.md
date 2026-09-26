# Session handoff — 2026-09-26

Point-in-time snapshot, written so work can continue in a fresh session
(including a cloud session, which gets the repositories and nothing else).
**It is not live state.** Check git and the source before relying on any
claim here; the durable documents it points to are the authoritative ones.

Both repositories are on branch `chore/backend-and-setup`.

## 0. Update — end of the 2026-09-26 cloud session (read this first)

- **Branches:** `chore/backend-and-setup` is merged into `main` in both repos
  (here via PR #13). Single working branch per repo:
  `claude/nifty-newton-8w8fhh`, cut from `main`. The old
  `chore/backend-and-setup` branches are fully merged; the session could not
  delete them (git proxy 403), the user deletes them on GitHub. `staging` and
  `production` were left alone. See `.agents/MEMORY.md` for working rules.
- **Current task:** two ids per order (`id` + `offlineId`), a syncing screen
  after login, and local-first mobile screens. Full plan and findings:
  `laundry_pos_mobile/docs/OFFLINE-ID-SYNC-PLAN.md`.
- **Done here (working branch):** `Order.offlineId` + unique
  `(storeId, offlineId)` (migration `20260926100000_add_order_offline_id`);
  create idempotent by `offlineId`; bulk-sync `orderRef` resolves an
  `offlineId` via DB lookup across requests; order DTO returns `offlineId`
  and payment `clientActionId`; contract §3.5. `tsc` and `eslint` clean;
  **integration suite not run** (needs Postgres) — run it before merging.
- **Artifacts:** mobile owner-screen wireframes —
  https://claude.ai/artifact/KXDqbi19o2crwHR9rw8to3
- **Discussions:** "store" in the user's words = outlet; web orders keep
  `offlineId` null on the server (recommended: an id the app assigns to a web
  order stays on the phone — pending user confirmation).

Everything below is the earlier snapshot.

---

## 1. Read these first, in this order

| Document | Repo | What it is |
| --- | --- | --- |
| `.agents/MOBILE-API-CONTRACT.md` | laundry_pos | **Backend-authoritative** `/api/v1` contract: headers, outlet rules, payment-method resolution, full endpoint inventory. Every claim carries file:line. |
| `docs/OUTLET-PARITY-SPEC.md` | laundry_pos_mobile | The client-side plan the mobile implementation followed (O0–O11). |
| `docs/OUTLET-DEVICE-TEST.md` | laundry_pos_mobile | Live on-device verification log — what passed, what is still blocked, findings F1–F6. |
| `.agents/ui-review/FIX-STATUS.md` | laundry_pos | The M0–M9 workspace UI review round and its verification evidence. |
| `.agents/CURRENT-STATE.md` | laundry_pos | Long-form implemented state. Some sections carry dated corrections; trust the newest. |

Anything not written down here or in those files did not survive the
session. In particular: **`.wiki/` is gitignored in both repositories and
native `~/.claude` memory is machine-local — neither reaches a cloud
session.** Only committed files travel.

---

## 2. What landed

### laundry_pos

- `fix(workspace): M2-M9 UI review fixes and parent corrections` — the
  Antigravity M2–M9 round plus the corrections found verifying it. Headline
  fixes: a Super Admin freeze breach (global `admin.css` leaking into
  `soa ad-root`), silent phone-number corruption, all-amber status badges,
  and an outlet filter whose "Clear" emptied the table.
- `feat(api): outlet-correct orders and organization payment methods for mobile`
  — six API changes, summarised in §0 of the contract doc.

Gates at that point: `tsc` 0, `lint` 0 errors, `build` passes, integration
suite **46/46**.

### laundry_pos_mobile

- `docs: outlet parity implementation spec`
- `feat: outlet-aware app, plus the web parity fixes that came with it` —
  `OutletScopeCubit`, `OutletSwitcher`, `OutletRequiredScreen`,
  `phone_normalizer`, outlet-keyed caches and per-outlet offline sync,
  server-driven payment methods, violet `Ready`.

Gates: `flutter analyze` clean, **273 tests pass**.

---

## 3. Open decisions — not bugs, someone must choose

1. **Outlet-less orders are auto-assigned to the organization's oldest
   active outlet** (`src/server/services/orders.ts:320`). Every order the
   pre-outlet mobile app created went there. Changing it would re-attribute
   historical data and affect the workspace, so it was documented rather
   than altered. Moot once every client sends an outlet explicitly.
2. **`/payment-methods/platform` and `/payment-methods/platform/{id}`** are
   now duplicates of the canonical pair. Nothing calls them but test `B4.2`.
   Left in place, marked deprecated; delete when someone is confident no
   deployed client uses them.
3. **An organization with zero enabled payment methods** ("One Wash" in dev
   data) can take no prepaid order and collect no balance. No API change
   fixes this — its owner must enable a method.
4. **Employee phone is not persisted on save** in the workspace. Needs a
   server change; owner's call.
5. **F6 from the device log**: the org has both a method named "COD" and a
   "Pay on delivery" checkout choice. Confusing for staff; data/product fix.

---

## 4. Next steps

**Mobile, to finish verification** (`docs/OUTLET-DEVICE-TEST.md`):

- Owner path: A7, A9, A14–A18 still ⏳ — notably the offline two-outlet
  bulk-sync case (A18), which is the one that used to misattribute orders.
- Sections B, C and D are 🚫, blocked on test accounts: an employee with one
  outlet, one with two, one with zero, and a One Wash owner sign-in.
- Findings F1–F5 are low severity and unfixed. F1 is real but cosmetic: the
  payment-method model still guesses a `type`, so Card and COD both show a
  "Cash" subtitle.

**Backend, optional:**

- Decide open items 1 and 2 above.
- `tsconfig.tsbuildinfo` is tracked (inherited from `main`, not introduced
  here) and dirties the tree on every build — worth untracking plus a
  `.gitignore` entry.

**Before any production deploy:** `.agents/CURRENT-STATE.md` records that
production's `_prisma_migrations` still lists the pre-squash history.
Reconcile it first or `prisma migrate deploy` will fail against production.

---

## 4b. Left unfinished when this session ended

Documentation only — no code is in an unfinished state, and every repo
gate was green at the last run.

- **`API_ENDPOINTS.md`**: the outlet header conventions and section 6
  (Payment Methods) are rewritten and committed. Still stale:
  - the `POST /api/v1/auth/login` and `GET /api/v1/auth/status` response
    examples do not show the `organizations[]` array (with
    `allowedOutlets` / `defaultOutletId`) those routes now return, nor the
    same two fields added to each `stores[]` row;
  - `GET /api/v1/dashboard/rollups` and `POST /api/v1/dashboard/reconcile`
    are implemented but undocumented — `rollups` is outlet-scoped and
    requires `X-Outlet-Id` for employees;
  - the Super Admin routes under `/api/v1/super-admin/**` are undocumented,
    deliberately, as they are not a mobile-client concern.
  `.agents/MOBILE-API-CONTRACT.md` covers all of the above correctly and is
  the authoritative source in the meantime.
- **`.wiki/wiki/references/mobile-api-contract.md`** was not updated. Its
  "Contract 3" section says the `API_ENDPOINTS.md` outlet gap "does not
  require any change on the `laundry_pos_mobile` side until that app adopts
  the outlet/organization model" — that condition is now met, so that
  paragraph is stale. The wiki is gitignored, so this only matters on the
  machine that holds it.
- **Native `~/.claude` memory** for this project records the standing
  workflow and tooling governance, but nothing from this session's
  architecture work. That was deliberate: it is all in committed files.

## 5. Gotchas that cost time

- **The integration suite looks broken but is not.** On PostgreSQL 18 /
  macOS the disposable cluster dies with *"postmaster became multithreaded
  during startup"*, surfaced only as `pg_ctl: could not start server`. Run
  `LC_ALL=C LANG=C npm run test:subscription-payments`. Also in
  `tests/README.md`.
- **`admin.css` is global.** Super Admin renders as `soa ad-root`, so any
  `.ad-*` change reaches the frozen Super Admin UI. Scope workspace-only
  changes under `.ad-app`.
- **Employees must send `X-Outlet-Id`** on `/orders`, `/orders/sync`,
  `/orders/bulk-sync` and `/dashboard/rollups`, or every call 403s. This is
  deliberate and will not be relaxed.
- **`/api/v1/dashboard` ignores the header** and reads `?outletId=` only.
- **Payments are irreversible** — no void, refund or correction path exists
  anywhere in the services. Never record one without explicit user intent.
- **`scripts/qa_audit.mjs`** is an untracked leftover QA harness with
  hardcoded absolute paths; it is the only source of the repo's two lint
  warnings and is intentionally not committed. It will not exist in a fresh
  clone.
