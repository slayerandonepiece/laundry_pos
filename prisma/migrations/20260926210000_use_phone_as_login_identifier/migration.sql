-- Reconcile missing/invalid/duplicate personal phone numbers before deployment.
-- Never derive a user's login from organization contact details or invent one.
BEGIN;
LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "phone" IS NULL OR regexp_replace("phone", '[^0-9]', '', 'g') !~ '^[0-9]{8,15}$') THEN
    RAISE EXCEPTION 'Phone login migration requires a verified 8-15 digit personal phone for every user. Backfill missing/invalid phones first.';
  END IF;
  IF EXISTS (SELECT 1 FROM "users" GROUP BY regexp_replace("phone", '[^0-9]', '', 'g') HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Phone login migration requires unique normalized personal phones. Resolve duplicate phones first.';
  END IF;
END $$;
UPDATE "users" SET "phone" = regexp_replace("phone", '[^0-9]', '', 'g');
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;
DROP INDEX IF EXISTS "users_phone_idx";
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
ALTER TABLE "users" DROP COLUMN "username";
COMMIT;
