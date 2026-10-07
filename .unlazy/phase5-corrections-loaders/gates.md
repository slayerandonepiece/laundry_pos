# Gates: Phase 5 corrections and loaders

OWNS: src/server/services/orders.ts, src/features/admin/**, src/features/super-admin/**, src/app/api/v1/orders/**, src/app/super-admin/**, tests/**, .agents/CURRENT-STATE.md, .agents/MOBILE-API-CONTRACT.md

Scope: Deliver Phase 5A corrections and Phase 5B pending/loading coverage without weakening authorization, tenant isolation, visual behavior, or the disposable-database boundary.

Depth Tree:
- 5A domain: cancellation state, rollup reversal, post-delivery correction records, audit rows, API/action/UI wiring, contract documentation.
- 5A verification: exact rollup reversal, final-delivery rejection, role matrix, actor/reason auditability, tenant isolation.
- 5B mutation UX: verify each named action and fix only demonstrated missing pending/double-submit behavior.
- 5B route UX: add skeletons only for the three named Super Admin route segments.
- Integration: types, lint, disposable PostgreSQL suite, role-specific desktop/mobile browser evidence, factual shared-state documentation.

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node /Users/reddygona/.agents/skills/unlazy/scripts/gate-lint.mjs .unlazy/phase5-corrections-loaders/gates.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: TypeScript accepts the complete Phase 5 implementation
  CHECK: npx tsc --noEmit
  EXPECT: ""
  EVIDENCE: pending

- [ ] G2: lint reports no errors beyond the two documented qa_audit warnings
  CHECK: npm run lint
  EXPECT: 2 warnings
  EVIDENCE: pending

- [ ] G3: corrections and existing integration behavior pass on disposable PostgreSQL
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments
  EXPECT: tests passed
  EVIDENCE: pending

- [ ] G4: cancellation reverses rollups exactly once, delivered cancellation is rejected, every correction records actor and reason, role matrix and tenant isolation pass
  EVIDENCE: pending

- [ ] G5: every affected mutation visibly disables and shows progress, and order punch, payment, deliver, and import cannot double-submit
  EVIDENCE: pending

- [ ] G6: outlets, announcements, and deletion requests render matching loading skeletons without layout shift
  EVIDENCE: pending

- [ ] G7: affected owner, employee, and Super Admin screens are verified at desktop and mobile widths
  EVIDENCE: pending

- [ ] G8: CURRENT-STATE and the mobile contract accurately describe implemented correction behavior and verification limits
  EVIDENCE: pending

- [ ] G9: no migration runs against a shared database and no deploy, push, or commit is performed
  EVIDENCE: pending
