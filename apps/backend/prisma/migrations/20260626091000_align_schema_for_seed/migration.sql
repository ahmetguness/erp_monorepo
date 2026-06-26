CREATE TYPE "MailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE "MailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

CREATE TYPE "TaskType" AS ENUM ('APPROVAL', 'COLLECTION', 'SERVICE', 'NOTIFICATION', 'CHECK', 'AUTOMATION', 'GENERAL');

CREATE TYPE "AutomationTrigger" AS ENUM ('LOW_STOCK', 'OVERDUE_INVOICE', 'HIGH_VALUE_INVOICE', 'LOW_MARGIN', 'CHECK_DUE_SOON');

CREATE TYPE "AutomationAction" AS ENUM ('CREATE_TASK', 'CREATE_NOTIFICATION', 'DRAFT_REMINDER_EMAIL', 'REQUEST_APPROVAL', 'CREATE_PURCHASE_REQUEST_DRAFT');

ALTER TABLE "attendances" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "boms"
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3);

ALTER TABLE "marketplace_sync_jobs" ALTER COLUMN "jobType" DROP DEFAULT;

ALTER TABLE "payrolls" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "tenant_users" ADD COLUMN "preferences" JSONB;

ALTER TABLE "tenants"
  ADD COLUMN "isCustomPricing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "planChangedAt" TIMESTAMP(3);

ALTER TABLE "work_centers"
  ADD COLUMN "laborRate" DECIMAL(10,2),
  ADD COLUMN "overheadRate" DECIMAL(10,2);

ALTER TABLE "work_order_operations"
  ADD COLUMN "actualRunTime" DECIMAL(10,2),
  ADD COLUMN "actualSetupTime" DECIMAL(10,2),
  ADD COLUMN "plannedRunTime" DECIMAL(10,2),
  ADD COLUMN "plannedSetupTime" DECIMAL(10,2);

ALTER TABLE "work_orders"
  ADD COLUMN "actualLaborCost" DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN "actualMaterialCost" DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN "actualOverheadCost" DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN "estimatedLaborCost" DECIMAL(18,2),
  ADD COLUMN "estimatedMaterialCost" DECIMAL(18,2),
  ADD COLUMN "estimatedOverheadCost" DECIMAL(18,2),
  ADD COLUMN "scrapCost" DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN "scrapQty" DECIMAL(18,3) DEFAULT 0,
  ADD COLUMN "scrapReason" TEXT;

CREATE TABLE "tenant_feature_overrides" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "featureKey" "FeatureKey" NOT NULL,
  "value" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "tenant_feature_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mail_messages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "direction" "MailDirection" NOT NULL DEFAULT 'OUTBOUND',
  "status" "MailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "providerId" TEXT,
  "from" TEXT,
  "replyTo" TEXT,
  "to" TEXT[],
  "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "textPreview" TEXT,
  "attachments" JSONB,
  "attachmentCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "sentById" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tasks" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "type" "TaskType" NOT NULL DEFAULT 'GENERAL',
  "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "module" TEXT,
  "entityType" "EntityType",
  "entityId" TEXT,
  "href" TEXT,
  "source" TEXT,
  "assignedToId" TEXT,
  "createdById" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_rules" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trigger" "AutomationTrigger" NOT NULL,
  "action" "AutomationAction" NOT NULL,
  "module" TEXT NOT NULL,
  "conditions" JSONB,
  "actionConfig" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "lastResult" JSONB,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_center_capacities" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workCenterId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "capacity" DECIMAL(10,2) NOT NULL,
  "allocated" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_center_capacities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_feature_overrides_tenantId_idx" ON "tenant_feature_overrides"("tenantId");
CREATE UNIQUE INDEX "tenant_feature_overrides_tenantId_featureKey_key" ON "tenant_feature_overrides"("tenantId", "featureKey");
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX "api_keys_tenantId_isActive_idx" ON "api_keys"("tenantId", "isActive");
CREATE INDEX "api_keys_tenantId_deletedAt_idx" ON "api_keys"("tenantId", "deletedAt");
CREATE INDEX "mail_messages_tenantId_direction_createdAt_idx" ON "mail_messages"("tenantId", "direction", "createdAt");
CREATE INDEX "mail_messages_tenantId_status_createdAt_idx" ON "mail_messages"("tenantId", "status", "createdAt");
CREATE INDEX "mail_messages_tenantId_sentById_idx" ON "mail_messages"("tenantId", "sentById");
CREATE INDEX "tasks_tenantId_assignedToId_status_idx" ON "tasks"("tenantId", "assignedToId", "status");
CREATE INDEX "tasks_tenantId_status_dueAt_idx" ON "tasks"("tenantId", "status", "dueAt");
CREATE INDEX "tasks_tenantId_entityType_entityId_idx" ON "tasks"("tenantId", "entityType", "entityId");
CREATE UNIQUE INDEX "tasks_tenantId_source_key" ON "tasks"("tenantId", "source");
CREATE INDEX "automation_rules_tenantId_isActive_idx" ON "automation_rules"("tenantId", "isActive");
CREATE INDEX "automation_rules_tenantId_trigger_idx" ON "automation_rules"("tenantId", "trigger");
CREATE INDEX "automation_rules_deletedAt_idx" ON "automation_rules"("deletedAt");
CREATE UNIQUE INDEX "automation_rules_tenantId_name_key" ON "automation_rules"("tenantId", "name");
CREATE INDEX "work_center_capacities_tenantId_idx" ON "work_center_capacities"("tenantId");
CREATE UNIQUE INDEX "work_center_capacities_tenantId_workCenterId_date_key" ON "work_center_capacities"("tenantId", "workCenterId", "date");
CREATE INDEX "bank_transactions_refType_refId_idx" ON "bank_transactions"("refType", "refId");
CREATE INDEX "marketplace_sync_jobs_tenantId_integrationId_status_idx" ON "marketplace_sync_jobs"("tenantId", "integrationId", "status");
CREATE INDEX "marketplace_sync_jobs_tenantId_jobType_status_idx" ON "marketplace_sync_jobs"("tenantId", "jobType", "status");

ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_center_capacities" ADD CONSTRAINT "work_center_capacities_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "work_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_center_capacities" ADD CONSTRAINT "work_center_capacities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
