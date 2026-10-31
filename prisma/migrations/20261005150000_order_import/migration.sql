-- Super Admin history import: imported orders are marked and grouped into batches
-- so a whole batch can be undone. Additive; existing orders are not imported.
CREATE TYPE "ImportBatchStatus" AS ENUM ('IMPORTED', 'UNDONE');

CREATE TABLE "import_batches" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "createdById" TEXT,
  "undoneById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "orderCount" INTEGER NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "status" "ImportBatchStatus" NOT NULL DEFAULT 'IMPORTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "undoneAt" TIMESTAMP(3),
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_batches_storeId_idempotencyKey_key" ON "import_batches"("storeId", "idempotencyKey");
CREATE INDEX "import_batches_storeId_createdAt_idx" ON "import_batches"("storeId", "createdAt");
CREATE INDEX "import_batches_outletId_idx" ON "import_batches"("outletId");

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_undoneById_fkey"
  FOREIGN KEY ("undoneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "isImported" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "importBatchId" TEXT;
CREATE INDEX "orders_importBatchId_idx" ON "orders"("importBatchId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
