-- Organization payment placement and order-status message defaults. This is
-- additive: existing organization methods retain BOTH, and existing
-- organizations intentionally receive no message-template rows.

CREATE TYPE "PaymentStage" AS ENUM ('PRE_ORDER', 'POST_ORDER', 'BOTH');
CREATE TYPE "MessageAttachment" AS ENUM ('NONE', 'ORDER_SLIP_PDF', 'INVOICE_PDF');

ALTER TABLE "platform_payment_methods"
  ADD COLUMN "enabledByDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultStage" "PaymentStage" NOT NULL DEFAULT 'BOTH';

ALTER TABLE "organization_payment_methods"
  ADD COLUMN "stage" "PaymentStage" NOT NULL DEFAULT 'BOTH';

CREATE TABLE "platform_message_templates" (
  "id" TEXT NOT NULL,
  "statusKey" "WorkStatus" NOT NULL,
  "body" TEXT NOT NULL,
  "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
  "defaultAttachment" "MessageAttachment" NOT NULL DEFAULT 'NONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_message_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_message_templates" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "statusKey" "WorkStatus" NOT NULL,
  "body" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "attachment" "MessageAttachment" NOT NULL DEFAULT 'NONE',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_message_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_message_templates_statusKey_key"
  ON "platform_message_templates"("statusKey");
CREATE UNIQUE INDEX "organization_message_templates_storeId_statusKey_key"
  ON "organization_message_templates"("storeId", "statusKey");
CREATE INDEX "organization_message_templates_storeId_idx"
  ON "organization_message_templates"("storeId");
CREATE INDEX "organization_message_templates_updatedById_idx"
  ON "organization_message_templates"("updatedById");

ALTER TABLE "organization_message_templates"
  ADD CONSTRAINT "organization_message_templates_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_message_templates"
  ADD CONSTRAINT "organization_message_templates_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "platform_payment_methods"
  ("id", "code", "name", "active", "enabledByDefault", "defaultStage", "createdAt", "updatedAt")
VALUES
  ('platform-payment-cod', 'COD', 'Cash on delivery', true, true, 'PRE_ORDER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('platform-payment-cash', 'CASH', 'Cash', true, true, 'POST_ORDER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('platform-payment-upi', 'UPI', 'UPI', true, true, 'BOTH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "enabledByDefault" = EXCLUDED."enabledByDefault",
  "defaultStage" = EXCLUDED."defaultStage",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "platform_message_templates"
  ("id", "statusKey", "body", "defaultEnabled", "defaultAttachment", "createdAt", "updatedAt")
VALUES
  ('platform-message-placed', 'PENDING', 'Hi {customer}, we received your order {orderNo} at {store}. Total: ₹{total}. Expected delivery: {dueDate}. Details: {link}', false, 'NONE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('platform-message-in-progress', 'IN_PROGRESS', 'Hi {customer}, your order {orderNo} at {store} is being processed. We will let you know when it is ready.', false, 'NONE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('platform-message-ready', 'READY', 'Hi {customer}, your laundry order {orderNo} at {store} is ready for delivery. Amount due: ₹{due}. Order details: {link}. Thank you.', true, 'ORDER_SLIP_PDF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('platform-message-delivered', 'DELIVERED', 'Hi {customer}, your order {orderNo} from {store} was delivered on {date}. Total paid: ₹{total} via {method}. Invoice {invoiceNo}: {link}. Thank you for choosing {store}.', true, 'INVOICE_PDF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("statusKey") DO NOTHING;
