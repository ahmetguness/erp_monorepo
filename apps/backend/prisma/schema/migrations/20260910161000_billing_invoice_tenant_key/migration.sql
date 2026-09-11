ALTER TABLE "billing_invoices" DROP CONSTRAINT IF EXISTS "billing_invoices_providerInvoiceId_key";
CREATE UNIQUE INDEX "billing_invoices_tenantId_providerInvoiceId_key" ON "billing_invoices"("tenantId", "providerInvoiceId");
