-- Reconciliation lines may only reference a parent reconciliation and account
-- owned by the same tenant.
CREATE UNIQUE INDEX "reconciliations_tenantId_id_key"
ON "reconciliations"("tenantId", "id");

ALTER TABLE "reconciliation_lines"
DROP CONSTRAINT "reconciliation_lines_reconciliationId_fkey";

ALTER TABLE "reconciliation_lines"
DROP CONSTRAINT "reconciliation_lines_accountId_fkey";

ALTER TABLE "reconciliation_lines"
ADD CONSTRAINT "reconciliation_lines_tenantId_reconciliationId_fkey"
FOREIGN KEY ("tenantId", "reconciliationId")
REFERENCES "reconciliations"("tenantId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reconciliation_lines"
ADD CONSTRAINT "reconciliation_lines_tenantId_accountId_fkey"
FOREIGN KEY ("tenantId", "accountId")
REFERENCES "ledger_accounts"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
