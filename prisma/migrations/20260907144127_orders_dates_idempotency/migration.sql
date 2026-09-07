-- Store Order/Payment/Expense dates as calendar dates (no time component),
-- matching existing UI semantics where these are Asia/Kolkata calendar days,
-- not instants. Also add an idempotency key for safe order-creation retries.

ALTER TABLE "orders"
  ALTER COLUMN "orderDate" TYPE DATE USING "orderDate"::date,
  ALTER COLUMN "dueDate" TYPE DATE USING "dueDate"::date,
  ALTER COLUMN "completedAt" TYPE DATE USING "completedAt"::date;

ALTER TABLE "orders" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");

ALTER TABLE "payments"
  ALTER COLUMN "paidAt" TYPE DATE USING "paidAt"::date;

ALTER TABLE "expenses"
  ALTER COLUMN "dueDate" TYPE DATE USING "dueDate"::date,
  ALTER COLUMN "paidAt" TYPE DATE USING "paidAt"::date;
