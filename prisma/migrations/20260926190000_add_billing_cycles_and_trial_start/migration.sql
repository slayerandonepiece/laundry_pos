-- Add new billing cycle values to the BillingCycle enum
ALTER TYPE "BillingCycle" ADD VALUE IF NOT EXISTS 'HALF_YEARLY';
ALTER TYPE "BillingCycle" ADD VALUE IF NOT EXISTS 'QUARTERLY';
ALTER TYPE "BillingCycle" ADD VALUE IF NOT EXISTS 'MONTHLY';

-- Add trial start date to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trialStartsAt" DATE;
