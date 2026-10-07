# Gates: Super Admin history import

OWNS: prisma/schema.prisma, prisma/migrations/**, src/server/services/order-import.ts, src/server/services/dashboard-rollups.ts, src/server/services/orders.ts, src/server/services/order-invoices.ts, src/app/super-admin/**, src/features/super-admin/**, src/features/admin/**, src/app/api/v1/orders/**, tests/**, scripts/test-subscription-payments.mjs, .agents/CURRENT-STATE.md, .agents/MOBILE-API-CONTRACT.md

Scope: Build the complete Super Admin historical-order import and atomic undo flow without changing unrelated behavior or any shared database.

Depth Tree:
- D1 schema and additive migration
- D1 import validation, grouping, idempotent transaction, and bulk rollups
- D1 undo safety, exact rollup reversal, audit history, and tenant isolation
- D1 imported-order exclusions for activity, notifications, invoices, and mobile sync
- D1 Super Admin spreadsheet UI, preview, confirmation, errors, and responsive states
- D1 integration tests, documentation, browser verification, and final evidence audit

- [x] G0: this ledger states outcomes that can fail
  CHECK: node /Users/reddygona/.agents/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7a28f240ce2c18df02f92e28ea2768ec3b3389bb5d0718d389dc06adfe269637; exit=0; EXPECT=matched; output-sha256=5143c1258a9df6b9ef4e5513e93ec0122f63bb28b9081fae1e4d229522fb401d; output-bytes=151; shell=/bin/sh; cwd=/Users/reddygona/Documents/skills/laundry_pos; path=332de01e0a1d/38 entries

- [ ] G1: import rollups equal a fresh aggregate and undo restores them exactly while a second undo is a no-op
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments
  EXPECT: ORDER_IMPORT_ACCEPTANCE_PASSED
  EVIDENCE: pending

- [ ] G2: duplicate submission creates no duplicate orders, payments, events, or rollups
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments
  EXPECT: ORDER_IMPORT_IDEMPOTENCY_PASSED
  EVIDENCE: pending

- [ ] G3: authorization and tenant isolation reject signed-out, owner, employee, cross-organization, and cross-outlet access
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments
  EXPECT: ORDER_IMPORT_AUTHORIZATION_PASSED
  EVIDENCE: pending

- [ ] G4: name auto-fill preserves typed names and retains an existing customer name when the import name is empty
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments
  EXPECT: ORDER_IMPORT_NAME_RULES_PASSED
  EVIDENCE: pending

- [ ] G5: future dates, unknown services, invalid phones, fractional Item quantities, and oversized batches return precise row errors
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments
  EXPECT: ORDER_IMPORT_VALIDATION_PASSED
  EVIDENCE: pending

- [ ] G6: imported orders never generate invoices or enter today activity, notifications, or mobile sync deltas
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments
  EXPECT: ORDER_IMPORT_EXCLUSIONS_PASSED
  EVIDENCE: pending

- [ ] G7: the TypeScript project compiles cleanly
  CHECK: npx tsc --noEmit && printf 'TYPECHECK_PASSED\n'
  EXPECT: TYPECHECK_PASSED
  EVIDENCE: pending

- [ ] G8: lint has zero errors and only the two approved qa_audit warnings
  CHECK: npm run lint && printf 'LINT_ACCEPTANCE_PASSED\n'
  EXPECT: LINT_ACCEPTANCE_PASSED
  EVIDENCE: pending

- [ ] G9: Super Admin desktop and 375px mobile render the editable grid, preview, confirmation, loading, error, undo warning, and row controls without overflow
  EVIDENCE: pending

- [x] G10: migration remains unapplied to shared databases and no deploy, push, or commit is performed
  EVIDENCE: Read-only git and source inspection only; no migration, deploy, push, commit, or shared-database command was run.

ABANDON: G1 Phase 3 order-number counters are absent from main, all local and remote refs, schema, migrations, and indexed source; Phase 4 cannot satisfy its required allocator contract.
ABANDON: G2 Idempotency implementation depends on the missing Phase 3 allocation contract, so duplicate-safe import cannot be implemented faithfully in this branch.
ABANDON: G3 The protected page and actions were not added because their core service cannot be implemented before the stated prerequisite is present.
ABANDON: G4 Name-resolution code and tests were not added because Phase 4 implementation is blocked at its explicit prerequisite.
ABANDON: G5 Row validation code and tests were not added because Phase 4 implementation is blocked at its explicit prerequisite.
ABANDON: G6 Imported-order exclusions cannot be implemented without the imported-order persistence and service that depend on the missing prerequisite.
ABANDON: G7 A post-implementation TypeScript gate cannot be claimed because no Phase 4 implementation was performed.
ABANDON: G8 A post-implementation lint gate cannot be claimed because no Phase 4 implementation was performed.
ABANDON: G9 Browser verification cannot be performed because the Phase 4 page was not built while its prerequisite is absent.
