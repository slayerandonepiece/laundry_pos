-- AlterEnum
ALTER TYPE "WorkStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "WorkStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

-- Migrate existing COMPLETED rows to DELIVERED
UPDATE "orders" SET "status" = 'DELIVERED' WHERE "status"::text = 'COMPLETED';
UPDATE "status_events" SET "status" = 'DELIVERED' WHERE "status"::text = 'COMPLETED';
