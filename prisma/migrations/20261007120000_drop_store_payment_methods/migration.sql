-- The per-store free-text payment method list is retired. Every payment method
-- now comes from the platform catalogue (platform_payment_methods), enabled per
-- organization in organization_payment_methods. Payment history is unaffected:
-- payments.method keeps its own text snapshot of the name.
DROP TABLE "store_payment_methods";
