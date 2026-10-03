CREATE TABLE IF NOT EXISTS "auth_throttle" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "auth_throttle_updatedAt_idx" ON "auth_throttle"("updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "store_memberships_storeId_idempotencyKey_key"
  ON "store_memberships"("storeId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_storeId_idempotencyKey_key"
  ON "orders"("storeId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_storeId_idempotencyKey_key"
  ON "expenses"("storeId", "idempotencyKey");

DROP INDEX IF EXISTS "store_memberships_idempotencyKey_key";
DROP INDEX IF EXISTS "orders_idempotencyKey_key";
DROP INDEX IF EXISTS "expenses_idempotencyKey_key";
