-- Prevent a ledger account from referencing a parent owned by another tenant.
ALTER TABLE "ledger_accounts"
DROP CONSTRAINT "ledger_accounts_parentId_fkey";

CREATE UNIQUE INDEX "ledger_accounts_tenantId_id_key"
ON "ledger_accounts"("tenantId", "id");

ALTER TABLE "ledger_accounts"
ADD CONSTRAINT "ledger_accounts_tenantId_parentId_fkey"
FOREIGN KEY ("tenantId", "parentId")
REFERENCES "ledger_accounts"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
