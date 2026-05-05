-- CreateEnum
CREATE TYPE "LotUsedRefType" AS ENUM ('SALES_ORDER', 'WORK_ORDER', 'DELIVERY_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "BankTransactionRefType" AS ENUM ('PAYMENT', 'INVOICE', 'RECONCILIATION', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('SYNC_ORDERS', 'SYNC_STOCK', 'SYNC_PRODUCTS');

-- AlterEnum: AppModule — add CONTACTS, INVOICING, APPROVALS
ALTER TYPE "AppModule" ADD VALUE 'CONTACTS';
ALTER TYPE "AppModule" ADD VALUE 'INVOICING';
ALTER TYPE "AppModule" ADD VALUE 'APPROVALS';

-- AlterTable: attendances — add updatedAt
ALTER TABLE "attendances" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- AlterTable: bank_transactions — refType String → BankTransactionRefType enum
ALTER TABLE "bank_transactions" DROP COLUMN "refType";
ALTER TABLE "bank_transactions" ADD COLUMN "refType" "BankTransactionRefType";

-- AlterTable: lot_serial_numbers — usedRefType String → LotUsedRefType enum
ALTER TABLE "lot_serial_numbers" DROP COLUMN "usedRefType";
ALTER TABLE "lot_serial_numbers" ADD COLUMN "usedRefType" "LotUsedRefType";

-- AlterTable: marketplace_listing_snapshots — lastSentQty Int → Decimal
ALTER TABLE "marketplace_listing_snapshots" ALTER COLUMN "lastSentQty" SET DATA TYPE DECIMAL(18,3);

-- AlterTable: marketplace_sync_jobs — jobType/status String → Enum
ALTER TABLE "marketplace_sync_jobs" DROP COLUMN "jobType";
ALTER TABLE "marketplace_sync_jobs" ADD COLUMN "jobType" "SyncJobType" NOT NULL DEFAULT 'SYNC_ORDERS';
ALTER TABLE "marketplace_sync_jobs" DROP COLUMN "status";
ALTER TABLE "marketplace_sync_jobs" ADD COLUMN "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable: payrolls — add updatedAt
ALTER TABLE "payrolls" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- CreateIndex: account_entries refType/refId
CREATE INDEX "account_entries_refType_refId_idx" ON "account_entries"("refType", "refId");

-- CreateIndex: check_promissory_notes contactId
CREATE INDEX "check_promissory_notes_tenantId_contactId_idx" ON "check_promissory_notes"("tenantId", "contactId");

-- CreateIndex: demo_requests tenantId
CREATE INDEX "demo_requests_tenantId_idx" ON "demo_requests"("tenantId");

-- CreateIndex: invitations roleId
CREATE INDEX "invitations_roleId_idx" ON "invitations"("roleId");

-- CreateIndex: work_order_operations workCenterId
CREATE INDEX "work_order_operations_tenantId_workCenterId_idx" ON "work_order_operations"("tenantId", "workCenterId");

-- AddForeignKey: demo_requests → tenants
ALTER TABLE "demo_requests" ADD CONSTRAINT "demo_requests_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: invitations → tenants
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: invitations → roles
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: invitations → users (invitedBy)
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedBy_fkey"
  FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
