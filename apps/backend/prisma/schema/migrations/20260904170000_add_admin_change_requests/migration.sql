CREATE TYPE "AdminChangeRequestType" AS ENUM ('TENANT_PLAN_UPDATE', 'TENANT_STATUS_UPDATE', 'PLAN_FEATURE_UPDATE', 'FEATURE_OVERRIDE_UPSERT');
CREATE TYPE "AdminChangeRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'ROLLED_BACK');

CREATE TABLE "admin_change_requests" (
  "id" TEXT NOT NULL,
  "type" "AdminChangeRequestType" NOT NULL,
  "status" "AdminChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "targetId" TEXT NOT NULL,
  "targetLabel" TEXT NOT NULL,
  "requiredPermission" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "previousValues" JSONB,
  "affectedTenantCount" INTEGER NOT NULL DEFAULT 0,
  "affectedUserCount" INTEGER NOT NULL DEFAULT 0,
  "requestedById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "admin_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_change_requests_status_createdAt_idx" ON "admin_change_requests"("status", "createdAt");
CREATE INDEX "admin_change_requests_requestedById_status_idx" ON "admin_change_requests"("requestedById", "status");
CREATE INDEX "admin_change_requests_type_targetId_status_idx" ON "admin_change_requests"("type", "targetId", "status");
ALTER TABLE "admin_change_requests" ADD CONSTRAINT "admin_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_change_requests" ADD CONSTRAINT "admin_change_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "admin_permissions" ("id", "key") VALUES
('admin-permission-change-request-read', 'change-request.read'),
('admin-permission-change-request-reject', 'change-request.reject'),
('admin-permission-tenant-plan-approve', 'tenant.plan.approve'),
('admin-permission-tenant-status-approve', 'tenant.status.approve'),
('admin-permission-feature-approve', 'feature.approve'),
('admin-permission-feature-override-approve', 'feature.override.approve');

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT 'admin-role-super', "id" FROM "admin_permissions" WHERE "key" IN (
  'change-request.read', 'change-request.reject', 'tenant.plan.approve', 'tenant.status.approve', 'feature.approve', 'feature.override.approve'
);
INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT 'admin-role-finance', "id" FROM "admin_permissions" WHERE "key" IN ('change-request.read', 'change-request.reject', 'tenant.plan.approve');
INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT 'admin-role-operations', "id" FROM "admin_permissions" WHERE "key" IN ('change-request.read', 'change-request.reject', 'tenant.status.approve');
