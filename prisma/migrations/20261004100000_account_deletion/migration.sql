-- CreateEnum
CREATE TYPE "DeletionScope" AS ENUM ('ORGANIZATION', 'SELF');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('PENDING', 'RESTORED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DeletionChannel" AS ENUM ('MOBILE', 'WEB', 'SUPPORT');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "deletionScheduledFor" TIMESTAMP(3),
ADD COLUMN     "isReviewDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "role" "Role" NOT NULL,
    "scope" "DeletionScope" NOT NULL,
    "status" "DeletionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "restoredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "requestedVia" "DeletionChannel" NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_record_archive" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceSeq" INTEGER NOT NULL,
    "type" "SubscriptionPaymentType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "paidAt" DATE NOT NULL,
    "coversFrom" DATE,
    "coversTo" DATE,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_record_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletion_requests_status_scheduledFor_idx" ON "account_deletion_requests"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "account_deletion_requests_userId_idx" ON "account_deletion_requests"("userId");

-- CreateIndex
CREATE INDEX "account_deletion_requests_organizationId_idx" ON "account_deletion_requests"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_record_archive_invoiceSeq_key" ON "billing_record_archive"("invoiceSeq");

