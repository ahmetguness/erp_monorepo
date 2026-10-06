ALTER TABLE "notifications" ADD COLUMN "source" TEXT;

CREATE UNIQUE INDEX "notifications_tenantId_userId_source_key"
ON "notifications"("tenantId", "userId", "source");
