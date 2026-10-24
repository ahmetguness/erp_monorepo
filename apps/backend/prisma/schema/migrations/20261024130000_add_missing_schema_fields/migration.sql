ALTER TABLE "billing_coupons" ADD COLUMN "description" TEXT, ADD COLUMN "plan" TEXT;
ALTER TABLE "e_documents" ADD COLUMN "submissionIdempotencyKey" TEXT;
ALTER TABLE "invoices" ADD COLUMN "postingIdempotencyKey" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "e_documents_tenantId_submissionIdempotencyKey_key" ON "e_documents"("tenantId", "submissionIdempotencyKey");
CREATE UNIQUE INDEX "invoices_tenantId_postingIdempotencyKey_key" ON "invoices"("tenantId", "postingIdempotencyKey");
CREATE UNIQUE INDEX "journal_entries_tenantId_idempotencyKey_key" ON "journal_entries"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "stock_movements_tenantId_idempotencyKey_key" ON "stock_movements"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "units_tenantId_id_key" ON "units"("tenantId", "id");
