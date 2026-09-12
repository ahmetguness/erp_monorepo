CREATE TABLE "admin_inbox_item_states" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "ownerId" TEXT,
  "readAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_inbox_item_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_inbox_item_states_adminId_sourceType_sourceId_key" ON "admin_inbox_item_states"("adminId", "sourceType", "sourceId");
CREATE INDEX "admin_inbox_item_states_adminId_resolvedAt_updatedAt_idx" ON "admin_inbox_item_states"("adminId", "resolvedAt", "updatedAt");
CREATE INDEX "admin_inbox_item_states_ownerId_resolvedAt_idx" ON "admin_inbox_item_states"("ownerId", "resolvedAt");

CREATE TABLE "admin_inbox_preferences" (
  "adminId" TEXT NOT NULL,
  "approvals" BOOLEAN NOT NULL DEFAULT true,
  "security" BOOLEAN NOT NULL DEFAULT true,
  "incidents" BOOLEAN NOT NULL DEFAULT true,
  "expirations" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_inbox_preferences_pkey" PRIMARY KEY ("adminId")
);

INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
('admin-permission-inbox-read', 'inbox.read', 'Birleşik admin gelen kutusunu görüntüler'),
('admin-permission-inbox-manage', 'inbox.manage', 'Admin görevlerini atar ve sonuçlandırır')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role
JOIN "admin_permissions" permission ON permission."key" = 'inbox.read'
WHERE role."key" IN ('SUPER_ADMIN','SUPPORT','FINANCE','OPERATIONS','SECURITY','READ_ONLY_AUDITOR')
ON CONFLICT DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role
JOIN "admin_permissions" permission ON permission."key" = 'inbox.manage'
WHERE role."key" IN ('SUPER_ADMIN','OPERATIONS','SECURITY')
ON CONFLICT DO NOTHING;
