CREATE UNIQUE INDEX "contacts_tenantId_id_key" ON "contacts"("tenantId", "id");
CREATE UNIQUE INDEX "invoices_tenantId_id_key" ON "invoices"("tenantId", "id");
CREATE UNIQUE INDEX "bank_accounts_tenantId_id_key" ON "bank_accounts"("tenantId", "id");
CREATE UNIQUE INDEX "cash_accounts_tenantId_id_key" ON "cash_accounts"("tenantId", "id");
CREATE UNIQUE INDEX "payments_tenantId_id_key" ON "payments"("tenantId", "id");

ALTER TABLE "payments" DROP CONSTRAINT "payments_contactId_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_bankAccountId_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_cashAccountId_fkey";
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_paymentId_fkey";
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_invoiceId_fkey";
ALTER TABLE "account_entries" DROP CONSTRAINT "account_entries_contactId_fkey";

ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_bankAccountId_fkey" FOREIGN KEY ("tenantId", "bankAccountId") REFERENCES "bank_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_cashAccountId_fkey" FOREIGN KEY ("tenantId", "cashAccountId") REFERENCES "cash_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_paymentId_fkey" FOREIGN KEY ("tenantId", "paymentId") REFERENCES "payments"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "contacts"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
