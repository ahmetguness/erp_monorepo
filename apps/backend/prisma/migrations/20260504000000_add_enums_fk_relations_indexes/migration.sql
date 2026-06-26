-- CreateEnum
CREATE TYPE "LotUsedRefType" AS ENUM ('SALES_ORDER', 'WORK_ORDER', 'DELIVERY_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "BankTransactionRefType" AS ENUM ('PAYMENT', 'INVOICE', 'RECONCILIATION', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('SYNC_ORDERS', 'SYNC_STOCK', 'SYNC_PRODUCTS');

-- AlterEnum: AppModule — add CONTACTS, INVOICING, APPROVALS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppModule') THEN
    CREATE TYPE "AppModule" AS ENUM (
      'ACCOUNTING',
      'INVENTORY',
      'CRM',
      'SALES',
      'PURCHASING',
      'WAREHOUSE',
      'PRODUCTION',
      'SERVICE',
      'HR',
      'PAYROLL',
      'MARKETPLACE',
      'REPORTING',
      'CONTACTS',
      'INVOICING',
      'APPROVALS',
      'MAIL',
      'WORKFLOW',
      'DOCUMENTS'
    );
  END IF;
END $$;

-- CreateEnum: missing demo/invitation enums from the current Prisma schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DemoRequestStatus') THEN
    CREATE TYPE "DemoRequestStatus" AS ENUM (
      'PENDING',
      'APPROVED',
      'PROVISIONING',
      'PROVISIONED',
      'REJECTED',
      'EXPIRED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvitationStatus') THEN
    CREATE TYPE "InvitationStatus" AS ENUM (
      'PENDING',
      'ACCEPTED',
      'EXPIRED',
      'CANCELLED'
    );
  END IF;
END $$;

-- CreateTable: demo_requests
CREATE TABLE IF NOT EXISTS "demo_requests" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "fullName" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "plan" "Plan" NOT NULL DEFAULT 'STARTER',
  "status" "DemoRequestStatus" NOT NULL DEFAULT 'PENDING',
  "tenantId" TEXT,
  "setPasswordToken" TEXT,
  "setPasswordExpiry" TIMESTAMP(3),
  "notes" TEXT,
  "rejectedReason" TEXT,
  "processedAt" TIMESTAMP(3),
  "processedBy" TEXT,
  CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "demo_requests_email_idx" ON "demo_requests"("email");
CREATE INDEX IF NOT EXISTS "demo_requests_status_idx" ON "demo_requests"("status");
CREATE INDEX IF NOT EXISTS "demo_requests_createdAt_idx" ON "demo_requests"("createdAt");

-- CreateTable: invitations
CREATE TABLE IF NOT EXISTS "invitations" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "roleId" TEXT,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedBy" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_tenantId_email_key" ON "invitations"("tenantId", "email");
CREATE INDEX IF NOT EXISTS "invitations_tenantId_idx" ON "invitations"("tenantId");
CREATE INDEX IF NOT EXISTS "invitations_status_idx" ON "invitations"("status");
CREATE INDEX IF NOT EXISTS "invitations_tokenHash_idx" ON "invitations"("tokenHash");

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
