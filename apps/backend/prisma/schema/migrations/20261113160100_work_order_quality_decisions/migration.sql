CREATE TYPE "WorkOrderQualityStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "work_orders" ADD COLUMN "qualityStatus" "WorkOrderQualityStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "work_order_history" ADD COLUMN "qualityDecision" "WorkOrderQualityStatus", ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "work_order_history_tenantId_idempotencyKey_key" ON "work_order_history"("tenantId", "idempotencyKey");
