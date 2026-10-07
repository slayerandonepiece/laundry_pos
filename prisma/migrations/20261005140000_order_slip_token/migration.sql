-- Opaque token for the customer-facing order slip link (created lazily, like the
-- invoice token). Additive: existing orders have none until a slip is first shared.
ALTER TABLE "orders" ADD COLUMN "slipToken" TEXT;
CREATE UNIQUE INDEX "orders_slipToken_key" ON "orders"("slipToken");
