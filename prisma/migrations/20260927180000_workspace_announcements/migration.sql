CREATE TABLE "workspace_announcements" (
  "id" TEXT NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "audience" VARCHAR(16) NOT NULL DEFAULT 'store',
  "tone" VARCHAR(16) NOT NULL DEFAULT 'info',
  "storeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "actionLabel" VARCHAR(60),
  "actionHref" VARCHAR(500),
  "published" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_announcements_audience_check" CHECK ("audience" IN ('store','platform','all')),
  CONSTRAINT "workspace_announcements_tone_check" CHECK ("tone" IN ('info','warning')),
  CONSTRAINT "workspace_announcements_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX "workspace_announcements_published_createdAt_idx" ON "workspace_announcements"("published", "createdAt");
