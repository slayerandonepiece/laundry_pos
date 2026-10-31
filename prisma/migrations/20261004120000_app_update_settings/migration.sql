-- CreateTable
CREATE TABLE "app_update_settings" (
    "platform" TEXT NOT NULL,
    "softMinVersion" TEXT,
    "urgentMinVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "app_update_settings_pkey" PRIMARY KEY ("platform")
);
