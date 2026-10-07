# Gates: Phase 2 order delivery and sharing

OWNS: PHASE2-GATES.md

Scope: record the blocked Phase 2 contract without editing paths concurrently owned by prerequisite and import work.

## Depth Tree

- L1 — transactional order/status service and integration tests.
- L2 — mobile delivery API and error contract.
- L3 — web payment/delivery dialogs and mutation states.
- L4 — order-slip/invoice documents and template-driven sharing.
- Root — type, lint, disposable database, rendered PDF, and responsive-role verification.

- [x] G0: this ledger states outcomes that can fail
  CHECK: node /Users/reddygona/.agents/skills/unlazy/scripts/gate-lint.mjs PHASE2-GATES.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=4b2da10b0f23707736d355810e122d5fbd6f736e20a0e8b847eb21a192f1728a; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=/bin/sh; cwd=/Users/reddygona/Documents/skills/laundry_pos; path=332de01e0a1d/38 entries

- [ ] G1: service and API reject unpaid delivery while exact-balance delivery is atomic and idempotent
  EVIDENCE: pending

- [ ] G2: status is forward-only and terminal, and payment eligibility excludes COD and pre-order-only methods
  EVIDENCE: pending

- [ ] G3: authenticated and opaque-token order slips plus delivered invoices render and share through resolved organization templates
  EVIDENCE: pending

- [ ] G4: employee outlet authorization and tenant isolation hold across service, API, PDF, and sharing operations
  EVIDENCE: pending

- [ ] G5: TypeScript, lint, disposable-Postgres tests, rendered PDFs, and desktop/375px role flows pass
  EVIDENCE: pending

- [ ] G6: source-of-truth documents describe only implemented and verified behavior
  EVIDENCE: pending

ABANDON: G1 Phase 1 is not merged in this checkout and an active Phase 1 ledger plus a concurrently changing import ledger own the same order-service, schema, route, and test paths.
ABANDON: G2 Post-order payment eligibility is explicitly pending in Phase 1, and the overlapping order service is concurrently owned by two other ledgers.
ABANDON: G3 No organization message-template model, resolver, or contract exists in the checked-out source; Phase 1 lists it as pending.
ABANDON: G4 Authorization tests would require editing and executing paths currently owned by active overlapping work.
ABANDON: G5 No safe integrated Phase 2 artifact exists to validate while prerequisite and concurrent owners are unsettled.
ABANDON: G6 Documentation must not claim behavior that was intentionally not implemented.
