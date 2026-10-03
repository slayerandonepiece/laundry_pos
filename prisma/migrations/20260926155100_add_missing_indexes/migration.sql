-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "subscriptions_paidThroughDate_idx" ON "subscriptions"("paidThroughDate");

-- CreateIndex
CREATE INDEX "orders_orderDate_idx" ON "orders"("orderDate");
