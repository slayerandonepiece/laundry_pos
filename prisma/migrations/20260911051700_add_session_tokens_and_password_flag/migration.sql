CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "token" TEXT;

-- Backfill existing sessions with 32 cryptographically random bytes encoded as base64url (43 chars)
UPDATE "sessions"
SET "token" = rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
WHERE "token" IS NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_key" ON "sessions"("token");
