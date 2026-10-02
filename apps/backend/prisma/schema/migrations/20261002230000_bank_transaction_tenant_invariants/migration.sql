ALTER TABLE "bank_transactions"
  DROP CONSTRAINT IF EXISTS "bank_transactions_bankAccountId_fkey";

ALTER TABLE "bank_transactions"
  ADD CONSTRAINT "bank_transactions_tenantId_bankAccountId_fkey"
  FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "bank_accounts"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "bank_transactions_tenantId_id_key"
  ON "bank_transactions"("tenantId", "id");
