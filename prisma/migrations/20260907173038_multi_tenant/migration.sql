-- Multi-tenant retrofit: introduce Store as a first-class tenant, move role
-- off User onto per-store StoreMembership, and scope every tenant table
-- (products, orders, expenses, recurring_expense_series) to a store. The
-- existing single store's data is migrated in as the first real tenant.

-- 1. New enums
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'LOCKED');
CREATE TYPE "SubscriptionPaymentType" AS ENUM ('DEPOSIT', 'RENEWAL');

-- 2. stores
CREATE TABLE "stores" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
  "onboardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "onboardedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "stores" ADD CONSTRAINT "stores_onboardedById_fkey"
  FOREIGN KEY ("onboardedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate the existing single store's profile row into the first Store.
INSERT INTO "stores" ("id", "name", "address", "phone", "email", "status", "onboardedById", "updatedAt")
SELECT
  'store-express-laundry-01',
  COALESCE(NULLIF(sp."store", ''), 'Express Laundry'),
  sp."address",
  sp."phone",
  sp."email",
  'ACTIVE',
  (SELECT "id" FROM "users" WHERE "role" = 'OWNER' ORDER BY "createdAt" ASC LIMIT 1),
  CURRENT_TIMESTAMP
FROM "store_profile" sp
WHERE sp."id" = 'main';

-- Fallback in case no store_profile row existed (fresh/empty database).
INSERT INTO "stores" ("id", "name", "updatedAt")
SELECT 'store-express-laundry-01', 'Express Laundry', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "stores" WHERE "id" = 'store-express-laundry-01');

-- 3. store_memberships — one row per existing user, carrying their current role.
CREATE TABLE "store_memberships" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "store_memberships_userId_storeId_key" ON "store_memberships"("userId", "storeId");
CREATE INDEX "store_memberships_storeId_idx" ON "store_memberships"("storeId");
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "store_memberships" ("id", "userId", "storeId", "role")
SELECT gen_random_uuid()::text, u."id", 'store-express-laundry-01', u."role"
FROM "users" u;

-- 4. subscriptions — one row for the migrated store, terms left for Super
-- Admin to set explicitly (paidThroughDate NULL means never auto-locked).
CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "depositAmount" INTEGER NOT NULL,
  "depositPaidAt" DATE,
  "annualFeeAmount" INTEGER NOT NULL,
  "paidThroughDate" DATE,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_storeId_key" ON "subscriptions"("storeId");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "subscriptions" ("id", "storeId", "depositAmount", "annualFeeAmount", "notes", "updatedAt")
VALUES (gen_random_uuid()::text, 'store-express-laundry-01', 1000000, 500000, 'Migrated existing store — terms not yet set by Super Admin.', CURRENT_TIMESTAMP);

-- 5. subscription_payments — empty; no historical payment data existed before this.
CREATE TABLE "subscription_payments" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "invoiceSeq" SERIAL,
  "type" "SubscriptionPaymentType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "paidAt" DATE NOT NULL,
  "coversFrom" DATE,
  "coversTo" DATE,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_payments_invoiceSeq_key" ON "subscription_payments"("invoiceSeq");
CREATE INDEX "subscription_payments_storeId_idx" ON "subscription_payments"("storeId");
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. users: role moves to store_memberships; add isSuperAdmin.
ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" DROP COLUMN "role";

-- 7. Scope products/orders/expenses/recurring_expense_series to the store.
ALTER TABLE "products" ADD COLUMN "storeId" TEXT;
UPDATE "products" SET "storeId" = 'store-express-laundry-01';
ALTER TABLE "products" ALTER COLUMN "storeId" SET NOT NULL;
CREATE INDEX "products_storeId_idx" ON "products"("storeId");
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "storeId" TEXT;
UPDATE "orders" SET "storeId" = 'store-express-laundry-01';
ALTER TABLE "orders" ALTER COLUMN "storeId" SET NOT NULL;
CREATE INDEX "orders_storeId_idx" ON "orders"("storeId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurring_expense_series" ADD COLUMN "storeId" TEXT;
UPDATE "recurring_expense_series" SET "storeId" = 'store-express-laundry-01';
ALTER TABLE "recurring_expense_series" ALTER COLUMN "storeId" SET NOT NULL;
CREATE INDEX "recurring_expense_series_storeId_idx" ON "recurring_expense_series"("storeId");
ALTER TABLE "recurring_expense_series" ADD CONSTRAINT "recurring_expense_series_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD COLUMN "storeId" TEXT;
UPDATE "expenses" SET "storeId" = 'store-express-laundry-01';
ALTER TABLE "expenses" ALTER COLUMN "storeId" SET NOT NULL;
CREATE INDEX "expenses_storeId_idx" ON "expenses"("storeId");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. store_profile is superseded by stores.
DROP TABLE "store_profile";
