# Subscription payment integration regression

Run `npm run test:subscription-payments` from the repository root.

Prerequisites: installed npm dependencies and PostgreSQL's `initdb`, `pg_ctl`,
and `psql` on PATH. Verified with PostgreSQL 18.3 and Node 24.11.1. Run as a
non-root user with permission to start PostgreSQL and allocate shared memory.

The runner creates a disposable cluster under `/tmp`, disables TCP listening,
applies the repository's SQL migrations, and invokes the actual
`recordSubscriptionPayment()` service. It uses a real Prisma client with
`@prisma/adapter-pg` through the app's existing singleton hook; production
continues to use `@prisma/adapter-neon`. It does not read `.env` or use the
application's database URL. It stops the cluster and removes fixtures/data
after success or test failure. If stopping fails, it retains the data path
and reports an error rather than removing files from a running server.

The concurrency case holds a real subscription row lock, starts two service
calls, and waits until PostgreSQL reports both blocked. Only then does it
release the lock. In the old implementation both calls had already read the
same expiry before blocking on UPDATE. With the fix they block before the
read, then see successive committed expiry values. This makes the failure
reproducible without mocks, sleeps intended to induce races, or real invoices.

Assertions cover consecutive invoice periods, unique invoices, total amounts,
final expiry, returned DTOs, unchanged term for deposits, missing-subscription
rejection, and atomic rollback when PostgreSQL rejects an invoice insert.

These are focused regression tests, not the full application test suite.
Payment retry idempotency and the separate calendar-year correction are not
part of this fix. The year-2100 fixture avoids leap-day arithmetic ambiguity.
