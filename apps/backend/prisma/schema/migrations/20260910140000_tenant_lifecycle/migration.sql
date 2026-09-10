ALTER TYPE "TenantStatus" ADD VALUE 'ARCHIVED';
ALTER TYPE "TenantStatus" ADD VALUE 'DELETION_SCHEDULED';
ALTER TYPE "TenantStatus" ADD VALUE 'DELETED';
ALTER TABLE "tenants" ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "retentionUntil" TIMESTAMP(3), ADD COLUMN "deletionNotBefore" TIMESTAMP(3);
CREATE TABLE "tenant_lifecycle_requests" (
 "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "fromStatus" "TenantStatus" NOT NULL, "version" INTEGER NOT NULL, "input" JSONB NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING','APPLIED','REJECTED')),
 "requestedById" TEXT NOT NULL, "requestedByName" TEXT NOT NULL, "decidedById" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3)
);
CREATE INDEX "tenant_lifecycle_requests_tenantId_createdAt_idx" ON "tenant_lifecycle_requests"("tenantId", "createdAt");
CREATE UNIQUE INDEX "tenant_lifecycle_one_pending" ON "tenant_lifecycle_requests"("tenantId") WHERE "state" = 'PENDING';
CREATE TABLE "tenant_lifecycle_exports" (
 "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL, "digest" TEXT NOT NULL, "data" JSONB NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "tenant_lifecycle_exports_tenantId_createdAt_idx" ON "tenant_lifecycle_exports"("tenantId", "createdAt");
