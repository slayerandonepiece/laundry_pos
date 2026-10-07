# Gates: Phase 1 organization payments, messages, and onboarding defaults

OWNS: prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts, src/server/services/**, src/features/**, src/app/**, tests/**, .agents/CURRENT-STATE.md, .agents/MOBILE-API-CONTRACT.md, PHASE1-GATES.md

Scope: Deliver the owner-approved Phase 1 organization payment-stage and message-template behavior across additive persistence, backend enforcement, Super Admin/owner UI, mobile API, documentation, and regression evidence.

## Depth Tree

- 1. Persistence and platform defaults
  - 1.1 Add additive schema and migration fields/tables.
  - 1.2 Seed platform payment and message defaults without demo business data.
- 2. Server domain behavior
  - 2.1 Validate payment stages, COD restrictions, and tenant-scoped organization settings.
  - 2.2 Validate template placeholders, fallback, attachments, and audit entries.
  - 2.3 Apply all defaults atomically during organization onboarding.
  - 2.4 Enforce pre-order versus post-order payment eligibility in order/payment services.
- 3. Interfaces
  - 3.1 Add Super Admin Payments and Messages controls plus platform defaults.
  - 3.2 Make owner payment/message settings read-only and hide them from employees.
  - 3.3 Update mobile payment-method GET and block owner writes.
- 4. Integration and evidence
  - 4.1 Add role, tenant, fallback, validation, and rollback integration coverage.
  - 4.2 Update source-of-truth documentation.
  - 4.3 Run static, lint, disposable-Postgres, and responsive browser gates.

- [ ] G0: this ledger states outcomes that can fail
  CHECK: node /Users/reddygona/.agents/skills/unlazy/scripts/gate-lint.mjs PHASE1-GATES.md
  EXPECT: LINT OK
  EVIDENCE: pending

- [ ] G1: new organization onboarding atomically creates exactly the enabled-by-default payment methods with their stages and all four organization templates, and a missing post-order-capable default rolls back the organization
  EVIDENCE: pending

- [ ] G2: COD is rejected at POST_ORDER or BOTH by server validation, is locked to PRE_ORDER in Super Admin UI, and cannot be recorded as a payment
  EVIDENCE: pending

- [ ] G3: owner and employee roles cannot mutate organization payment methods or message templates
  EVIDENCE: pending

- [ ] G4: template saves reject unknown placeholders, enforce the length cap, and require {link} in READY and DELIVERED
  EVIDENCE: pending

- [ ] G5: an organization with no message-template rows resolves the current platform defaults
  EVIDENCE: pending

- [ ] G6: payment and message settings remain tenant-isolated between organizations
  EVIDENCE: pending

- [ ] G7: TypeScript compilation is clean
  CHECK: npx tsc --noEmit && echo PHASE1_TSC_OK
  EXPECT: PHASE1_TSC_OK
  EVIDENCE: pending

- [ ] G8: lint has no errors and only the two accepted qa_audit warnings
  CHECK: npm run lint && echo PHASE1_LINT_OK
  EXPECT: PHASE1_LINT_OK
  EVIDENCE: pending

- [ ] G9: the complete disposable-Postgres subscription/payment integration suite passes, including the new Phase 1 tests
  CHECK: LC_ALL=C LANG=C npm run test:subscription-payments && echo PHASE1_INTEGRATION_OK
  EXPECT: PHASE1_INTEGRATION_OK
  EVIDENCE: pending

- [ ] G10: Super Admin and owner screens touched by Phase 1 are checked at desktop and 375px mobile, and employee visibility is checked
  EVIDENCE: pending

- [ ] G11: CURRENT-STATE and MOBILE-API-CONTRACT describe only implemented, verified behavior and the stage/write-contract changes
  EVIDENCE: pending

- [ ] G12: final diff contains only task-traceable changes and no secret, Neon migration, deploy, push, or commit
  CHECK: git diff --check && echo PHASE1_DIFF_OK
  EXPECT: PHASE1_DIFF_OK
  EVIDENCE: pending
