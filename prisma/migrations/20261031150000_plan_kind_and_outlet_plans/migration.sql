-- Plans are one-time (organization deposit) or recurring (per outlet). Outlets carry their own plan,
-- and every payment records the plan, price and discount it was charged at. Additive, with a backfill.
CREATE TYPE "PlanKind" AS ENUM ('ONE_TIME', 'RECURRING');
ALTER TABLE "subscription_plans" ADD COLUMN "kind" "PlanKind" NOT NULL DEFAULT 'RECURRING';

ALTER TABLE "outlets" ADD COLUMN "planId" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN "planId" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN "planName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN "listAmount" INTEGER;
ALTER TABLE "subscription_payments" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "outlets_planId_idx" ON "outlets"("planId");
CREATE INDEX "subscription_payments_planId_idx" ON "subscription_payments"("planId");
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Each plan that charged a deposit gets a one-time companion plan, so the deposit stays visible and selectable.
CREATE TEMP TABLE plan_deposit_map AS
SELECT p."id" AS old_id, md5(random()::text || clock_timestamp()::text || p."id") AS new_id
FROM "subscription_plans" p
WHERE p."depositAmount" > 0 AND p."depositWaivedByDefault" = false;

INSERT INTO "subscription_plans" ("id", "name", "kind", "depositAmount", "annualFeeAmount", "billingCycle", "depositWaivedByDefault", "notes", "createdAt", "updatedAt", "archivedAt")
SELECT m.new_id, p."name" || ' deposit', 'ONE_TIME', p."depositAmount", 0, p."billingCycle", false, p."notes", p."createdAt", NOW(), p."archivedAt"
FROM plan_deposit_map m JOIN "subscription_plans" p ON p."id" = m.old_id;

-- Each outlet inherits its organization's recurring plan; the organization's own plan becomes its deposit plan.
UPDATE "outlets" o SET "planId" = s."planId"
FROM "subscriptions" s WHERE s."storeId" = o."storeId" AND s."planId" IS NOT NULL;

UPDATE "subscriptions" s SET "planId" = m.new_id
FROM plan_deposit_map m WHERE s."planId" = m.old_id;
UPDATE "subscriptions" s SET "planId" = NULL
WHERE s."planId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "subscription_plans" p WHERE p."id" = s."planId" AND p."kind" = 'ONE_TIME');

UPDATE "subscription_plans" SET "depositAmount" = 0, "depositWaivedByDefault" = false WHERE "kind" = 'RECURRING';
DROP TABLE plan_deposit_map;
