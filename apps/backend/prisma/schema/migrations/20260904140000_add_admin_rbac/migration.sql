CREATE TABLE "admin_roles" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "admin_permissions" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "admin_user_roles" (
  "adminUserId" TEXT NOT NULL,
  "adminRoleId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("adminUserId", "adminRoleId")
);
CREATE TABLE "admin_role_permissions" (
  "adminRoleId" TEXT NOT NULL,
  "adminPermissionId" TEXT NOT NULL,
  CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("adminRoleId", "adminPermissionId")
);
CREATE UNIQUE INDEX "admin_roles_key_key" ON "admin_roles"("key");
CREATE UNIQUE INDEX "admin_permissions_key_key" ON "admin_permissions"("key");
CREATE INDEX "admin_user_roles_adminRoleId_idx" ON "admin_user_roles"("adminRoleId");
CREATE INDEX "admin_role_permissions_adminPermissionId_idx" ON "admin_role_permissions"("adminPermissionId");
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_adminPermissionId_fkey" FOREIGN KEY ("adminPermissionId") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "admin_roles" ("id", "key", "name") VALUES
('admin-role-super', 'SUPER_ADMIN', 'Süper Admin'), ('admin-role-support', 'SUPPORT', 'Destek'),
('admin-role-finance', 'FINANCE', 'Finans'), ('admin-role-operations', 'OPERATIONS', 'Operasyon'),
('admin-role-security', 'SECURITY', 'Güvenlik'), ('admin-role-auditor', 'READ_ONLY_AUDITOR', 'Salt Okunur Denetçi');

INSERT INTO "admin_permissions" ("id", "key") SELECT 'admin-permission-' || row_number() OVER (), "key" FROM (VALUES
('dashboard.read'), ('tenant.read'), ('tenant.create'), ('tenant.settings.update'), ('tenant.plan.update'), ('tenant.status.update'),
('feature.read'), ('feature.update'), ('feature.override.create'), ('feature.override.delete'), ('operations.read'), ('audit.read'),
('security.read'), ('demo.read'), ('demo.approve'), ('demo.reject')) AS permission("key");

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT 'admin-role-super', "id" FROM "admin_permissions";
INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT mapping."roleId", permission."id" FROM (VALUES
('admin-role-support', 'dashboard.read'), ('admin-role-support', 'tenant.read'), ('admin-role-support', 'tenant.settings.update'), ('admin-role-support', 'feature.read'), ('admin-role-support', 'demo.read'),
('admin-role-finance', 'dashboard.read'), ('admin-role-finance', 'tenant.read'), ('admin-role-finance', 'tenant.plan.update'), ('admin-role-finance', 'audit.read'), ('admin-role-finance', 'demo.read'),
('admin-role-operations', 'dashboard.read'), ('admin-role-operations', 'tenant.read'), ('admin-role-operations', 'tenant.status.update'), ('admin-role-operations', 'feature.read'), ('admin-role-operations', 'operations.read'), ('admin-role-operations', 'demo.read'), ('admin-role-operations', 'demo.approve'), ('admin-role-operations', 'demo.reject'),
('admin-role-security', 'dashboard.read'), ('admin-role-security', 'tenant.read'), ('admin-role-security', 'operations.read'), ('admin-role-security', 'audit.read'), ('admin-role-security', 'security.read'),
('admin-role-auditor', 'dashboard.read'), ('admin-role-auditor', 'tenant.read'), ('admin-role-auditor', 'feature.read'), ('admin-role-auditor', 'operations.read'), ('admin-role-auditor', 'audit.read'), ('admin-role-auditor', 'security.read'), ('admin-role-auditor', 'demo.read')
) AS mapping("roleId", "permissionKey") JOIN "admin_permissions" permission ON permission."key" = mapping."permissionKey";

INSERT INTO "admin_user_roles" ("adminUserId", "adminRoleId") SELECT "id", 'admin-role-super' FROM "admin_users";
