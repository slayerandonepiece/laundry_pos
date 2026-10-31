-- Outlets are billed individually: each carries its own paid-through date and
-- renewal payments record the outlet they cover. Additive, with a backfill.
ALTER TABLE "outlets" ADD COLUMN "paidThroughDate" DATE;
ALTER TABLE "subscription_payments" ADD COLUMN "outletId" TEXT;

CREATE INDEX "subscription_payments_outletId_idx" ON "subscription_payments"("outletId");
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every existing outlet keeps the access it already had through its organization.
UPDATE "outlets" o
SET "paidThroughDate" = s."paidThroughDate"
FROM "subscriptions" s
WHERE s."storeId" = o."storeId" AND s."paidThroughDate" IS NOT NULL;

-- A renewal is attributed to its outlet only when the organization has exactly one.
UPDATE "subscription_payments" p
SET "outletId" = (SELECT o."id" FROM "outlets" o WHERE o."storeId" = p."storeId")
WHERE p."type" = 'RENEWAL' AND p."outletId" IS NULL
  AND (SELECT COUNT(*) FROM "outlets" o WHERE o."storeId" = p."storeId") = 1;
