-- AlterTable
ALTER TABLE "payments" ADD COLUMN "platformPaymentMethodId" TEXT;

-- CreateIndex
CREATE INDEX "payments_platformPaymentMethodId_idx" ON "payments"("platformPaymentMethodId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_platformPaymentMethodId_fkey" FOREIGN KEY ("platformPaymentMethodId") REFERENCES "platform_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
