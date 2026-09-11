-- AlterTable
ALTER TABLE "payments" ADD COLUMN "clientActionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_clientActionId_key" ON "payments"("clientActionId");
