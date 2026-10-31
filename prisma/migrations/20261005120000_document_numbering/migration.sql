-- Phase 3 document numbering is additive for existing documents. Legacy
-- order/invoice display values are preserved while new rows use per-store
-- counters allocated by the application in the same transaction as inserts.

CREATE TYPE "DocumentType" AS ENUM ('ORDER', 'INVOICE', 'RECEIPT', 'QUOTATION', 'CREDIT_NOTE');

ALTER TABLE "stores"
  ADD COLUMN "orgCode" TEXT,
  ADD COLUMN "orderSeqBase" BIGINT NOT NULL DEFAULT 1000000001;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "onboardedAt", id) AS value
  FROM "stores"
)
UPDATE "stores" AS s
SET "orgCode" = LPAD(numbered.value::text, 3, '0')
FROM numbered
WHERE numbered.id = s.id;

ALTER TABLE "stores"
  ALTER COLUMN "orgCode" SET NOT NULL,
  ADD CONSTRAINT "stores_orgCode_format_check" CHECK ("orgCode" ~ '^[0-9]{3,5}$'),
  ADD CONSTRAINT "stores_orderSeqBase_range_check" CHECK ("orderSeqBase" BETWEEN 1000000001 AND 9999999999);

-- New stores receive the next free code from this sequence (the application skips
-- codes already taken by a custom value before inserting).
CREATE SEQUENCE "stores_orgCode_seq";
SELECT setval('"stores_orgCode_seq"', COALESCE((SELECT MAX("orgCode"::integer) FROM "stores"), 0) + 1, false);
ALTER TABLE "stores"
  ALTER COLUMN "orgCode" SET DEFAULT lpad((nextval('"stores_orgCode_seq"'::regclass))::text, 3, '0'::text);

CREATE UNIQUE INDEX "stores_orgCode_key" ON "stores"("orgCode");
-- Numeric equivalence prevents visually ambiguous duplicates such as 001 and 00001.
CREATE UNIQUE INDEX "stores_orgCode_numeric_key" ON "stores"(("orgCode"::integer));

ALTER TABLE "orders" ALTER COLUMN "orderNumber" TYPE BIGINT;
ALTER SEQUENCE "orders_orderNumber_seq" AS BIGINT;
DROP INDEX "orders_orderNumber_key";
CREATE UNIQUE INDEX "orders_storeId_orderNumber_key" ON "orders"("storeId", "orderNumber");

ALTER TABLE "order_invoices" ADD COLUMN "invoiceNumber" TEXT;
UPDATE "order_invoices"
SET "invoiceNumber" = 'INV-' || LPAD("invoiceSeq"::text, 6, '0');
ALTER TABLE "order_invoices" ALTER COLUMN "invoiceNumber" SET NOT NULL;
CREATE UNIQUE INDEX "order_invoices_storeId_invoiceNumber_key" ON "order_invoices"("storeId", "invoiceNumber");

ALTER TABLE "payments" ADD COLUMN "receiptNumber" TEXT;
CREATE UNIQUE INDEX "payments_storeId_receiptNumber_key" ON "payments"("storeId", "receiptNumber");

CREATE TABLE "document_counters" (
  "storeId" TEXT NOT NULL,
  "docType" "DocumentType" NOT NULL,
  "fy" INTEGER NOT NULL,
  "nextValue" BIGINT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_counters_pkey" PRIMARY KEY ("storeId", "docType", "fy")
);

CREATE INDEX "document_counters_storeId_idx" ON "document_counters"("storeId");
ALTER TABLE "document_counters"
  ADD CONSTRAINT "document_counters_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "document_counters" ("storeId", "docType", "fy", "nextValue", "updatedAt")
SELECT s.id, 'ORDER'::"DocumentType", 0,
       GREATEST(s."orderSeqBase", COALESCE(MAX(o."orderNumber") + 1, s."orderSeqBase")),
       CURRENT_TIMESTAMP
FROM "stores" s
LEFT JOIN "orders" o ON o."storeId" = s.id
GROUP BY s.id, s."orderSeqBase";

SELECT setval(
  '"orders_orderNumber_seq"',
  GREATEST(COALESCE((SELECT MAX("orderNumber") FROM "orders"), 0) + 1, 1),
  false
);
