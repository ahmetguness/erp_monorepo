CREATE TYPE "AutomationExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "automation_executions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ruleId" TEXT,
  "trigger" "AutomationTrigger",
  "action" "AutomationAction",
  "entityType" "EntityType",
  "entityId" TEXT,
  "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'RUNNING',
  "input" JSONB,
  "output" JSONB,
  "error" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_executions_tenantId_status_startedAt_idx" ON "automation_executions"("tenantId", "status", "startedAt");
CREATE INDEX "automation_executions_tenantId_ruleId_startedAt_idx" ON "automation_executions"("tenantId", "ruleId", "startedAt");
CREATE INDEX "automation_executions_tenantId_entityType_entityId_idx" ON "automation_executions"("tenantId", "entityType", "entityId");

ALTER TABLE "automation_executions"
  ADD CONSTRAINT "automation_executions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_executions"
  ADD CONSTRAINT "automation_executions_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
