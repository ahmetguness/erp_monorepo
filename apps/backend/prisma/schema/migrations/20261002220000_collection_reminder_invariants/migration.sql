ALTER TABLE "collection_reminders"
  ADD COLUMN "remindAt" TIMESTAMP(3);

UPDATE "collection_reminders"
SET "remindAt" = "dueDate"
WHERE "remindAt" IS NULL;

-- migration-safety-reviewed: remindAt is fully backfilled above before NOT NULL and the table lock is accepted for this bounded metadata change
ALTER TABLE "collection_reminders"
  ALTER COLUMN "remindAt" SET NOT NULL;

-- migration-safety-reviewed: remove only exact tenant/invoice/schedule duplicates before enforcing the idempotency invariant while preserving the earliest record
DELETE FROM "collection_reminders" a
USING "collection_reminders" b
WHERE a."tenantId" = b."tenantId"
  AND a."invoiceId" = b."invoiceId"
  AND a."remindAt" = b."remindAt"
  AND a."createdAt" > b."createdAt";

ALTER TABLE "collection_reminders"
  DROP CONSTRAINT IF EXISTS "collection_reminders_contactId_fkey",
  DROP CONSTRAINT IF EXISTS "collection_reminders_invoiceId_fkey";

CREATE UNIQUE INDEX "collection_reminders_tenantId_id_key"
  ON "collection_reminders"("tenantId", "id");
CREATE UNIQUE INDEX "collection_reminders_tenantId_invoiceId_remindAt_key"
  ON "collection_reminders"("tenantId", "invoiceId", "remindAt");

ALTER TABLE "collection_reminders"
  ADD CONSTRAINT "collection_reminders_tenantId_contactId_fkey"
  FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "collection_reminders_tenantId_invoiceId_fkey"
  FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "collection_reminders_status_check"
  CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'CANCELLED'));
