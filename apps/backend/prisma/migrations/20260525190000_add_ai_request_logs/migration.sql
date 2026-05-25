-- AI governance request log.
CREATE TYPE "AiRequestType" AS ENUM (
  'PRIVATE_CHAT',
  'PUBLIC_CHAT',
  'MAIL_DRAFT',
  'SMART_FORM',
  'RECOMMENDED_ACTION',
  'OTHER'
);

CREATE TYPE "AiRequestStatus" AS ENUM (
  'STARTED',
  'SUCCEEDED',
  'FAILED',
  'FALLBACK'
);

CREATE TYPE "AiPermissionCheckResult" AS ENUM (
  'NOT_REQUIRED',
  'ALLOWED',
  'DENIED',
  'PARTIAL'
);

CREATE TABLE "ai_request_logs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT,
  "requestType" "AiRequestType" NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "entityType" "EntityType",
  "entityId" TEXT,
  "entityContext" JSONB,
  "permissionCheckResult" "AiPermissionCheckResult" NOT NULL DEFAULT 'NOT_REQUIRED',
  "redactedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inputSummary" TEXT,
  "outputSummary" TEXT,
  "draft" JSONB,
  "result" JSONB,
  "userApprovedAction" TEXT,
  "status" "AiRequestStatus" NOT NULL DEFAULT 'STARTED',
  "usedTools" BOOLEAN NOT NULL DEFAULT false,
  "tokenPrompt" INTEGER,
  "tokenCompletion" INTEGER,
  "tokenTotal" INTEGER,
  "errorMessage" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "ai_request_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_request_logs_tenantId_createdAt_idx" ON "ai_request_logs"("tenantId", "createdAt");
CREATE INDEX "ai_request_logs_tenantId_requestType_createdAt_idx" ON "ai_request_logs"("tenantId", "requestType", "createdAt");
CREATE INDEX "ai_request_logs_tenantId_entityType_entityId_idx" ON "ai_request_logs"("tenantId", "entityType", "entityId");
CREATE INDEX "ai_request_logs_userId_createdAt_idx" ON "ai_request_logs"("userId", "createdAt");

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
