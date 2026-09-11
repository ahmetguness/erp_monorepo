INSERT INTO "admin_permissions" ("id", "key", "description")
VALUES ('admin-permission-audit-manage', 'audit.manage', 'Platform audit saklama politikasını yönetir')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role
CROSS JOIN "admin_permissions" permission
WHERE role."key" IN ('SUPER_ADMIN', 'SECURITY') AND permission."key" = 'audit.manage'
ON CONFLICT DO NOTHING;
