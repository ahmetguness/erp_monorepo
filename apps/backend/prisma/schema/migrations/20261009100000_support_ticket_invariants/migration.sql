-- Normalize legacy lifecycle timestamps before enforcing state consistency.
UPDATE "platform_support_tickets"
SET "resolvedAt" = NULL, "closedAt" = NULL
WHERE "status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_TENANT');

UPDATE "platform_support_tickets"
SET "resolvedAt" = COALESCE("resolvedAt", "updatedAt"), "closedAt" = NULL
WHERE "status" = 'RESOLVED';

UPDATE "platform_support_tickets"
SET "closedAt" = COALESCE("closedAt", "updatedAt")
WHERE "status" = 'CLOSED';

-- Repair the mutually exclusive author columns and tenant-message visibility.
UPDATE "platform_ticket_messages"
SET "authorAdminId" = NULL, "isInternal" = FALSE
WHERE "senderType" = 'TENANT_USER';

UPDATE "platform_ticket_messages"
SET "authorUserId" = NULL
WHERE "senderType" = 'ADMIN_USER';

ALTER TABLE "platform_support_tickets"
  ADD CONSTRAINT "platform_support_tickets_lifecycle_timestamps_check"
  CHECK (
    ("status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_TENANT') AND "resolvedAt" IS NULL AND "closedAt" IS NULL)
    OR ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "closedAt" IS NULL)
    OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL)
  );

ALTER TABLE "platform_ticket_messages"
  ADD CONSTRAINT "platform_ticket_messages_sender_authorship_check"
  CHECK (
    ("senderType" = 'TENANT_USER' AND "authorAdminId" IS NULL AND "isInternal" = FALSE)
    OR ("senderType" = 'ADMIN_USER' AND "authorUserId" IS NULL)
  );
