CREATE TABLE "admin_sensitive_access_grants" (
  "id" TEXT NOT NULL, "adminId" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
  "fields" TEXT[], "purpose" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sensitive_access_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_sensitive_access_grants_adminId_tenantId_expiresAt_idx" ON "admin_sensitive_access_grants"("adminId", "tenantId", "expiresAt");
CREATE INDEX "admin_sensitive_access_grants_expiresAt_idx" ON "admin_sensitive_access_grants"("expiresAt");
ALTER TABLE "admin_sensitive_access_grants" ADD CONSTRAINT "admin_sensitive_access_grants_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_sensitive_access_grants" ADD CONSTRAINT "admin_sensitive_access_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "admin_permissions" ("id", "key", "description") VALUES ('admin-permission-sensitive-data-reveal', 'sensitive-data.reveal', 'Süreli ve gerekçeli hassas veri görüntüleme') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId") SELECT role."id", permission."id" FROM "admin_roles" role CROSS JOIN "admin_permissions" permission WHERE role."key" IN ('SUPER_ADMIN', 'SUPPORT', 'OPERATIONS', 'SECURITY') AND permission."key" = 'sensitive-data.reveal' ON CONFLICT DO NOTHING;
