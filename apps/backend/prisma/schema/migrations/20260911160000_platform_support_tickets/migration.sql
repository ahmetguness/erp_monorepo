DO $$ BEGIN
  CREATE TYPE "PlatformTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_TENANT', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformTicketCategory" AS ENUM ('TECHNICAL', 'BILLING', 'ACCOUNT', 'FEATURE_REQUEST', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformTicketSender" AS ENUM ('TENANT_USER', 'ADMIN_USER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "platform_support_tickets" (
  "id" TEXT PRIMARY KEY,
  "ticketNumber" TEXT NOT NULL UNIQUE,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "PlatformTicketCategory" NOT NULL DEFAULT 'TECHNICAL',
  "priority" "PlatformTicketPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "PlatformTicketStatus" NOT NULL DEFAULT 'OPEN',
  "assignedAdminId" TEXT REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "platform_support_tickets_tenantId_status_createdAt_idx" ON "platform_support_tickets"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "platform_support_tickets_status_priority_createdAt_idx" ON "platform_support_tickets"("status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "platform_support_tickets_assignedAdminId_status_idx" ON "platform_support_tickets"("assignedAdminId", "status");

CREATE TABLE IF NOT EXISTS "platform_ticket_messages" (
  "id" TEXT PRIMARY KEY,
  "ticketId" TEXT NOT NULL REFERENCES "platform_support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "senderType" "PlatformTicketSender" NOT NULL,
  "authorUserId" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "authorAdminId" TEXT REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "message" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "platform_ticket_messages_ticketId_createdAt_idx" ON "platform_ticket_messages"("ticketId", "createdAt");

INSERT INTO "admin_permissions" ("id", "key", "description")
VALUES
  ('admin-permission-support-ticket-read', 'support-ticket.read', 'Platform destek biletlerini görüntüler'),
  ('admin-permission-support-ticket-manage', 'support-ticket.manage', 'Platform destek biletlerini yönetir, yanıtlar ve kapatır')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("adminRoleId", "adminPermissionId")
SELECT role."id", permission."id"
FROM "admin_roles" role
CROSS JOIN "admin_permissions" permission
WHERE role."key" IN ('SUPER_ADMIN', 'SUPPORT')
  AND permission."key" IN ('support-ticket.read', 'support-ticket.manage')
ON CONFLICT DO NOTHING;
