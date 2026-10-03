-- CreateTable
CREATE TABLE "daily_outlet_summaries" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "ordersCreatedCount" INTEGER NOT NULL DEFAULT 0,
    "ordersCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "grossOrderAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentsCollectedAmount" INTEGER NOT NULL DEFAULT 0,
    "expensesAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_outlet_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_outlet_service_summaries" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "piecesCount" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_outlet_service_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_outlet_summaries_storeId_outletId_businessDate_key" ON "daily_outlet_summaries"("storeId", "outletId", "businessDate");

-- CreateIndex
CREATE INDEX "daily_outlet_summaries_storeId_businessDate_idx" ON "daily_outlet_summaries"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "daily_outlet_summaries_outletId_businessDate_idx" ON "daily_outlet_summaries"("outletId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_outlet_service_summaries_storeId_outletId_serviceName_businessDate_key" ON "daily_outlet_service_summaries"("storeId", "outletId", "serviceName", "businessDate");

-- CreateIndex
CREATE INDEX "daily_outlet_service_summaries_storeId_businessDate_idx" ON "daily_outlet_service_summaries"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "daily_outlet_service_summaries_outletId_businessDate_idx" ON "daily_outlet_service_summaries"("outletId", "businessDate");

-- AddForeignKey
ALTER TABLE "daily_outlet_summaries" ADD CONSTRAINT "daily_outlet_summaries_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_outlet_summaries" ADD CONSTRAINT "daily_outlet_summaries_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_outlet_service_summaries" ADD CONSTRAINT "daily_outlet_service_summaries_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_outlet_service_summaries" ADD CONSTRAINT "daily_outlet_service_summaries_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
