CREATE TABLE "tenant_provisioning_jobs" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "requestHash" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  "error" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_provisioning_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "tenant_provisioning_jobs_tenantId_createdAt_idx" ON "tenant_provisioning_jobs"("tenantId", "createdAt");
CREATE TABLE "tenant_provisioning_steps" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "key" TEXT NOT NULL CHECK ("key" IN ('TENANT_CREATED','OWNER_CREATED','DEFAULT_ROLES_CREATED','EMAIL_SENT')),
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_provisioning_steps_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "tenant_provisioning_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_provisioning_steps_jobId_key_key" UNIQUE ("jobId", "key")
);
