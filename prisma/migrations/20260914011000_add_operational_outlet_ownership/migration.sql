-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "outletId" TEXT;

-- AlterTable
ALTER TABLE "order_invoices" ADD COLUMN "outletId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "outletId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "outletId" TEXT,
ADD COLUMN "storeId" TEXT;

-- AlterTable
ALTER TABLE "recurring_expense_series" ADD COLUMN "outletId" TEXT;

-- AlterTable
ALTER TABLE "status_events" ADD COLUMN "outletId" TEXT,
ADD COLUMN "storeId" TEXT;

-- CreateIndex
CREATE INDEX "expenses_storeId_outletId_dueDate_idx" ON "expenses"("storeId", "outletId", "dueDate");

-- CreateIndex
CREATE INDEX "expenses_outletId_idx" ON "expenses"("outletId");

-- CreateIndex
CREATE INDEX "order_invoices_storeId_outletId_idx" ON "order_invoices"("storeId", "outletId");

-- CreateIndex
CREATE INDEX "orders_storeId_outletId_orderDate_idx" ON "orders"("storeId", "outletId", "orderDate");

-- CreateIndex
CREATE INDEX "orders_outletId_status_idx" ON "orders"("outletId", "status");

-- CreateIndex
CREATE INDEX "orders_outletId_dueDate_idx" ON "orders"("outletId", "dueDate");

-- CreateIndex
CREATE INDEX "payments_storeId_outletId_paidAt_idx" ON "payments"("storeId", "outletId", "paidAt");

-- CreateIndex
CREATE INDEX "payments_outletId_idx" ON "payments"("outletId");

-- CreateIndex
CREATE INDEX "recurring_expense_series_storeId_outletId_idx" ON "recurring_expense_series"("storeId", "outletId");

-- CreateIndex
CREATE INDEX "status_events_storeId_outletId_at_idx" ON "status_events"("storeId", "outletId", "at");

-- CreateIndex
CREATE INDEX "status_events_outletId_idx" ON "status_events"("outletId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_series" ADD CONSTRAINT "recurring_expense_series_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
