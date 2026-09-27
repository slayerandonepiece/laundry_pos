-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "accessGrantedUntil" DATE;

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "defaultTrialDays" INTEGER;
