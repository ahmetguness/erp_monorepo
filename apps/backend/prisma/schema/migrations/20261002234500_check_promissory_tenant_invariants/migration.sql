-- Tenant-safe ownership for contacts and payment links, plus domain checks.
CREATE UNIQUE INDEX "check_promissory_notes_tenantId_id_key"
  ON "check_promissory_notes"("tenantId", "id");

ALTER TABLE "check_promissory_notes"
  ADD CONSTRAINT "check_promissory_notes_tenantId_contactId_fkey"
  FOREIGN KEY ("tenantId", "contactId")
  REFERENCES "contacts"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
  DROP CONSTRAINT "payments_checkNoteId_fkey";

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_tenantId_checkNoteId_fkey"
  FOREIGN KEY ("tenantId", "checkNoteId")
  REFERENCES "check_promissory_notes"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "check_promissory_notes"
  ADD CONSTRAINT "check_promissory_notes_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "check_promissory_notes_due_date_check" CHECK ("dueDate" >= "issueDate"),
  ADD CONSTRAINT "check_promissory_notes_number_not_blank_check" CHECK (length(btrim("number")) > 0),
  ADD CONSTRAINT "check_promissory_notes_currency_code_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
