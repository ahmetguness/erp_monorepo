-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "withholdingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withholdingRateId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "totalWithholding" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'RECEIVE';

-- AlterTable
ALTER TABLE "tax_rates" ADD COLUMN     "isWithholding" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "collection_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collection_reminders_tenantId_idx" ON "collection_reminders"("tenantId");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_withholdingRateId_fkey" FOREIGN KEY ("withholdingRateId") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_reminders" ADD CONSTRAINT "collection_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_reminders" ADD CONSTRAINT "collection_reminders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_reminders" ADD CONSTRAINT "collection_reminders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
