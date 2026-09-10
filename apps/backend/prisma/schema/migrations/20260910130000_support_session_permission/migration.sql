INSERT INTO "admin_permissions" ("id", "key", "description")
VALUES ('permission_support_session_manage', 'support-session.manage', 'Request and operate owner-approved support sessions')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role CROSS JOIN "admin_permissions" permission
WHERE role."key" IN ('SUPER_ADMIN', 'SUPPORT') AND permission."key" = 'support-session.manage'
ON CONFLICT DO NOTHING;
