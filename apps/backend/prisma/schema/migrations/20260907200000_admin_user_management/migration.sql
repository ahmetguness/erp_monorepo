ALTER TABLE "admin_users"
ADD COLUMN "inviteTokenHash" TEXT,
ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
ADD COLUMN "invitationAcceptedAt" TIMESTAMP(3),
ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "admin_users_inviteTokenHash_key" ON "admin_users"("inviteTokenHash");

INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
('admin-user-read', 'admin-user.read', 'Admin kullanıcılarını görüntüleme'),
('admin-user-manage', 'admin-user.manage', 'Admin daveti, rol, hesap ve oturum yönetimi')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT r."id", p."id" FROM "admin_roles" r CROSS JOIN "admin_permissions" p
WHERE r."key" = 'SUPER_ADMIN' AND p."key" IN ('admin-user.read', 'admin-user.manage')
ON CONFLICT DO NOTHING;
