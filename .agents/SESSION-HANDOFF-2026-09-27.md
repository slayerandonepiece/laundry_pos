# Session handoff — 2026-09-27

Point-in-time consolidation requested by the user; Git and current source remain authoritative.

Claude created `feat/workspace-improvements` from `19eace2` (also main at inspection), then reached its session limit before committing. This batch consolidates the existing Claude/Gemini/Codex working tree, not changes from the separate Flutter repository.

Scope: phone login and credential revocation; onboarding/trial/billing lifecycle and indexes; owner/POS caching and interaction fixes; shared invoice PDF/preview/print/share and tokenized public views; responsive owner layouts and dialog loaders; Super Admin profile; persisted targeted announcements with bounded searchable organization selection; locked-store read-only browsing with mutation guards; payment-method heading action and shared footer alignment.

Six migration directories are included. Earlier approved development database migrations were applied; this consolidation does not run a remote migration, seed, reset, deployment, push or merge.

Validation: TypeScript passes; lint has zero errors and two existing unused-variable warnings in scripts/qa_audit.mjs. All 89 integration tests pass on disposable local PostgreSQL, and the isolated Next.js production build passes. Earlier browser evidence and limitations are in QA-*.md. Do not infer production or native-mobile success from these checks.

Local screenshots, generated Next type/build state and machine-specific Cursor hooks remain outside the commit. PERFORMANCE-OPTIMIZATION.patch is a duplicate historical diff; PERFORMANCE-OPTIMIZATION.md retains the review record.
