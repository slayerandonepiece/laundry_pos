# Express Laundry admin prototype

Open `/admin/login`. Demo username: `admin`; password: `admin@123$`.

Routes cover dashboard, products, sales, expenses and profile. Public website remains at `/`.

Admin source is isolated in `src/features/admin` with feature-local containers and components. Route files are in `src/app/admin`. Scoped admin CSS extends the installed public-site fonts and theme without replacing the existing website stylesheet or dependencies.

This is a local design prototype, not production authentication. Mock records and edits are stored in this browser's localStorage. Demo login/password state uses sessionStorage. Do not enter real customer data. Password changes last for the browser session only.

Working flows: login/logout, date/search/status filters, service creation/edit/archive, weight-slab preview, mixed-service order entry, order details, work-status updates, partial payments, expense entry/payment, profile updates and demo password changes.

Monthly expense entry creates the current bill and one next-month unpaid reminder. A production recurring scheduler, editable bill occurrences, real authentication/API/database, refunds, receipts/uploads, order editing, exports, discounts and tax handling remain future integration work. Mobile layouts use full-screen detail panels; desktop panels use half the screen at 1200px and above.

Validation: production build and ESLint; direct pricing checks for 4kg/4.01kg/6kg/6.5kg/8kg and mixed-service totals. Browser interaction and visual QA have not been run.
