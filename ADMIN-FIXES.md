# Admin responsive fixes — 5 September 2026

- Isolated admin footer from public-site footer styles. Shared neutral divider, page-aligned gutters, consistent content gap, and stacked mobile text across Dashboard, Products, Sales, Expenses and Profile.
- Mobile order and expense cards retain due dates, payment/work status and payment actions. Pagination controls have larger touch targets.
- Corrected per-item preview default and pricing-method transitions so valid service forms save.
- Shared reporting filters across route navigation; presets cover complete calendar periods, exposing upcoming monthly bills.
- Monthly demo expense occurrences extend through next month when loading or updating the workspace, with idempotent generation and month-end handling. This remains browser-local, not a background server scheduler.
- Native modal mobile navigation supports Escape/focus containment and body scroll locking. Desktop sidebar scrolls on short windows.
- Unknown product rows cannot save and Add service disables when every active service is selected.
- Cancelled orders show no collectible balance. Attention items are oldest-due first, with dates and a View all link.
- Untouched forms close directly; changed forms request confirmation. Password forms clear after success, support show/hide, and profile inputs validate phone/nonblank text.

Verification: build and ESLint passed; browser checked all five screens at 360/768/1440 px with no document-width overflow and consistent footer dimensions. Browser confirmed unchanged per-item service save, mobile expense actions, menu Escape and cross-route date preservation. Direct calculation checks covered slab pricing, recurrence idempotency, year rollover, February clamping and historical payment preservation.

Remaining prototype scope: real authentication/backend, bill editing, full order editing/audit history, uploads, refunds and accounting/export features still require implementation. No production deployment performed.
