ALTER TABLE "journal_entry_lines"
  DROP CONSTRAINT IF EXISTS "journal_entry_lines_journalEntryId_fkey";

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_tenantId_id_key" UNIQUE ("tenantId", "id");

ALTER TABLE "journal_entry_lines"
  ADD CONSTRAINT "journal_entry_lines_tenantId_journalEntryId_fkey"
  FOREIGN KEY ("tenantId", "journalEntryId")
  REFERENCES "journal_entries"("tenantId", "id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
