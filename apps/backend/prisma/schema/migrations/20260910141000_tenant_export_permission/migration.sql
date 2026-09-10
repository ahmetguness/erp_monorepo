INSERT INTO "admin_permissions" ("id", "key", "description")
VALUES ('permission_tenant_export', 'tenant.export', 'Export tenant business data for closure') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id" FROM "admin_roles" role CROSS JOIN "admin_permissions" permission
WHERE role."key" = 'SUPER_ADMIN' AND permission."key" = 'tenant.export' ON CONFLICT DO NOTHING;
