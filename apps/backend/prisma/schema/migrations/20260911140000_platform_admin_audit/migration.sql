CREATE TABLE "platform_admin_audit_logs" (
  "id" TEXT NOT NULL, "actorId" TEXT, "action" TEXT NOT NULL, "module" TEXT NOT NULL,
  "targetType" TEXT NOT NULL, "targetId" TEXT, "outcome" TEXT NOT NULL, "reason" TEXT,
  "approvalId" TEXT, "ipAddress" TEXT, "device" TEXT, "requestId" TEXT, "correlationId" TEXT,
  "beforeValues" JSONB, "afterValues" JSONB, "changedFields" JSONB NOT NULL,
  "previousHash" TEXT, "hash" TEXT NOT NULL, "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_admin_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "platform_audit_policies" (
  "id" TEXT NOT NULL DEFAULT 'default', "retentionDays" INTEGER NOT NULL DEFAULT 2555,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_audit_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_admin_audit_logs_hash_key" ON "platform_admin_audit_logs"("hash");
CREATE INDEX "platform_admin_audit_logs_createdAt_idx" ON "platform_admin_audit_logs"("createdAt");
CREATE INDEX "platform_admin_audit_logs_actorId_createdAt_idx" ON "platform_admin_audit_logs"("actorId", "createdAt");
CREATE INDEX "platform_admin_audit_logs_module_outcome_createdAt_idx" ON "platform_admin_audit_logs"("module", "outcome", "createdAt");
CREATE INDEX "platform_admin_audit_logs_targetType_targetId_createdAt_idx" ON "platform_admin_audit_logs"("targetType", "targetId", "createdAt");
INSERT INTO "platform_audit_policies" ("id", "retentionDays", "updatedAt") VALUES ('default', 2555, CURRENT_TIMESTAMP);
CREATE OR REPLACE FUNCTION prevent_platform_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'platform audit logs are append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "platform_admin_audit_no_update" BEFORE UPDATE ON "platform_admin_audit_logs" FOR EACH ROW EXECUTE FUNCTION prevent_platform_audit_mutation();
CREATE TRIGGER "platform_admin_audit_no_delete" BEFORE DELETE ON "platform_admin_audit_logs" FOR EACH ROW EXECUTE FUNCTION prevent_platform_audit_mutation();
