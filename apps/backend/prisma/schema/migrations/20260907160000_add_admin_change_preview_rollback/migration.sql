ALTER TABLE "admin_change_requests"
ADD COLUMN "reason" TEXT,
ADD COLUMN "ticketId" TEXT,
ADD COLUMN "rollbackOfId" TEXT;

UPDATE "admin_change_requests" SET "reason" = 'Legacy change request' WHERE "reason" IS NULL;
-- migration-safety-reviewed: Existing rows are backfilled immediately above before enforcing the required reason invariant.
ALTER TABLE "admin_change_requests" ALTER COLUMN "reason" SET NOT NULL;
CREATE INDEX "admin_change_requests_rollbackOfId_idx" ON "admin_change_requests"("rollbackOfId");

ALTER TABLE "audit_logs"
ADD COLUMN "adminId" TEXT,
ADD COLUMN "reason" TEXT,
ADD COLUMN "ticketId" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "approvalId" TEXT,
ADD COLUMN "rollbackOfId" TEXT;

CREATE INDEX "audit_logs_adminId_createdAt_idx" ON "audit_logs"("adminId", "createdAt");
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");
CREATE INDEX "audit_logs_approvalId_idx" ON "audit_logs"("approvalId");
