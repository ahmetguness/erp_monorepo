ALTER TABLE "saved_reports" ADD COLUMN "sharedRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "saved_reports" ADD COLUMN "sharedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "saved_reports" ADD COLUMN "columnTemplateName" TEXT;
ALTER TABLE "saved_reports" ADD COLUMN "pinnedToDashboard" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "saved_reports_tenantId_pinnedToDashboard_idx" ON "saved_reports"("tenantId", "pinnedToDashboard");
