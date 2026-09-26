-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "store_memberships" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "expenses_idempotencyKey_key" ON "expenses"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "store_memberships_idempotencyKey_key" ON "store_memberships"("idempotencyKey");
