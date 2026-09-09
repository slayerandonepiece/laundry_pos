-- The preceding migration used UUID text for existing rows, while newly
-- created invoices use Node's 32-byte base64url format. No customer links
-- existed before that deployment, so normalize only those migration-time
-- backfills before the public route is released.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "order_invoices"
SET "accessToken" = rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
WHERE length("accessToken") <> 43;
