-- Subscription prices follow the plan. depositAmount / annualFeeAmount become
-- optional per-organization overrides: NULL means "use the plan's current price".
-- Existing rows that simply copied their plan's price at the time are set to NULL;
-- rows that differ (negotiated overrides) and custom or trial subscriptions (no plan)
-- keep their stored value, and a deposit that was already paid stays frozen.
ALTER TABLE "subscriptions" ALTER COLUMN "depositAmount" DROP NOT NULL;
ALTER TABLE "subscriptions" ALTER COLUMN "annualFeeAmount" DROP NOT NULL;

UPDATE "subscriptions" s
SET "annualFeeAmount" = NULL
FROM "subscription_plans" p
WHERE s."planId" = p."id" AND s."annualFeeAmount" = p."annualFeeAmount";

UPDATE "subscriptions" s
SET "depositAmount" = NULL
FROM "subscription_plans" p
WHERE s."planId" = p."id"
  AND s."depositPaidAt" IS NULL
  AND s."depositAmount" = CASE WHEN p."depositWaivedByDefault" THEN 0 ELSE p."depositAmount" END;
