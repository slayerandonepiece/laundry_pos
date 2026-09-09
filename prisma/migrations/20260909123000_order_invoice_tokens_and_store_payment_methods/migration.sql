-- Customer-facing invoice links use opaque, non-sequential access tokens.
ALTER TABLE "order_invoices" ADD COLUMN "accessToken" TEXT;

UPDATE "order_invoices"
SET "accessToken" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "accessToken" IS NULL;

ALTER TABLE "order_invoices" ALTER COLUMN "accessToken" SET NOT NULL;
CREATE UNIQUE INDEX "order_invoices_accessToken_key" ON "order_invoices"("accessToken");

-- Customer payment methods are store-owned free text. Existing enum values
-- remain unchanged as historical snapshots; the enum itself stays in use by
-- platform subscription payments.
ALTER TABLE "payments" ALTER COLUMN "method" TYPE TEXT USING ("method"::text);

CREATE TABLE "store_payment_methods" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_payment_methods_storeId_name_key" ON "store_payment_methods"("storeId", "name");
CREATE INDEX "store_payment_methods_storeId_active_idx" ON "store_payment_methods"("storeId", "active");

ALTER TABLE "store_payment_methods"
ADD CONSTRAINT "store_payment_methods_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "store_payment_methods" ("id", "storeId", "name")
SELECT 'pm_' || md5("id" || ':Cash'), "id", 'Cash' FROM "stores"
UNION ALL
SELECT 'pm_' || md5("id" || ':UPI'), "id", 'UPI' FROM "stores";
