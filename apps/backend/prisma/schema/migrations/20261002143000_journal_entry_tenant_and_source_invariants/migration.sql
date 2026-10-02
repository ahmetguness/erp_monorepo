-- One source document may create at most one journal entry per tenant.
CREATE UNIQUE INDEX "journal_entries_tenantId_refType_refId_key"
ON "journal_entries"("tenantId", "refType", "refId");

-- A journal line may only reference a ledger account owned by the same tenant.
ALTER TABLE "journal_entry_lines"
DROP CONSTRAINT "journal_entry_lines_accountId_fkey";

ALTER TABLE "journal_entry_lines"
ADD CONSTRAINT "journal_entry_lines_tenantId_accountId_fkey"
FOREIGN KEY ("tenantId", "accountId")
REFERENCES "ledger_accounts"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
