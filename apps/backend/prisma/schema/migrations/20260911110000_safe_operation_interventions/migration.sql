ALTER TABLE "domain_event_outbox"
  ADD COLUMN "quarantinedAt" TIMESTAMP(3),
  ADD COLUMN "quarantinedById" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedById" TEXT,
  ADD COLUMN "resolutionNote" TEXT;
CREATE INDEX "domain_event_outbox_tenantId_resolvedAt_updatedAt_idx" ON "domain_event_outbox"("tenantId", "resolvedAt", "updatedAt");

ALTER TABLE "marketplace_sync_jobs"
  ADD COLUMN "quarantinedAt" TIMESTAMP(3),
  ADD COLUMN "quarantinedById" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedById" TEXT,
  ADD COLUMN "resolutionNote" TEXT;
CREATE INDEX "marketplace_sync_jobs_tenantId_resolvedAt_updatedAt_idx" ON "marketplace_sync_jobs"("tenantId", "resolvedAt", "updatedAt");

INSERT INTO "admin_permissions" ("id", "key", "description")
VALUES ('admin-permission-operations-manage', 'operations.manage', 'Retry, quarantine and resolve failed operations')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role CROSS JOIN "admin_permissions" permission
WHERE role."key" IN ('SUPER_ADMIN', 'OPERATIONS') AND permission."key" = 'operations.manage'
ON CONFLICT DO NOTHING;
