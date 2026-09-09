/*
  Warnings:

  - Changed the type of `method` on the `payments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('ANNUAL');

-- AlterTable
-- Hand-edited: cast existing free-text values instead of dropping the column
-- (verified beforehand that every existing row's value is exactly "UPI").
ALTER TABLE "payments" ALTER COLUMN "method" TYPE "PaymentMethod" USING ("method"::"PaymentMethod");

-- AlterTable
ALTER TABLE "subscription_payments" ADD COLUMN     "method" "PaymentMethod";

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planId" TEXT;

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "depositAmount" INTEGER NOT NULL,
    "annualFeeAmount" INTEGER NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'ANNUAL',
    "notes" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
