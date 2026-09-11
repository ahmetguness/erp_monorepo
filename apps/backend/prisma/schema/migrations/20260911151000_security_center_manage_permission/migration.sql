INSERT INTO "admin_permissions" ("id", "key", "description")
VALUES ('admin-permission-security-manage', 'security.manage', 'Platform güvenlik bulgularını ve ticket bağlantılarını yönetir')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role
CROSS JOIN "admin_permissions" permission
WHERE role."key" IN ('SUPER_ADMIN', 'SECURITY') AND permission."key" = 'security.manage'
ON CONFLICT DO NOTHING;
