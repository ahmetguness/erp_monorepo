INSERT INTO "admin_permissions" ("id", "key", "description")
VALUES ('admin-permission-search-read', 'search.read', 'Platform genelinde maskelenmiş arama yapar')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role
JOIN "admin_permissions" permission ON permission."key" = 'search.read'
WHERE role."key" IN (
  'SUPER_ADMIN', 'SUPPORT', 'FINANCE', 'OPERATIONS', 'SECURITY', 'READ_ONLY_AUDITOR'
)
ON CONFLICT DO NOTHING;
