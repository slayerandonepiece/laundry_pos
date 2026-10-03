-- AlterTable
ALTER TABLE "orders" ADD COLUMN "offlineId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_storeId_offlineId_key" ON "orders"("storeId", "offlineId");
