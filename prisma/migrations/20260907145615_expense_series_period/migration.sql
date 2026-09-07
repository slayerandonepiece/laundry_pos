-- Replace the redundant "monthly" boolean (derivable from seriesId) with a
-- periodMonth key that, paired with seriesId, gives a retry-safe unique
-- constraint for generating recurring-expense occurrences.

ALTER TABLE "expenses" DROP COLUMN "monthly";
ALTER TABLE "expenses" ADD COLUMN "periodMonth" TEXT;
CREATE UNIQUE INDEX "expenses_seriesId_periodMonth_key" ON "expenses"("seriesId", "periodMonth");
