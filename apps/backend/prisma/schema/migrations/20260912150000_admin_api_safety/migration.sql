CREATE TABLE "admin_idempotency_records" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PROCESSING',
  "statusCode" INTEGER,
  "contentType" TEXT,
  "responseBody" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_idempotency_records_adminId_method_path_key_key" ON "admin_idempotency_records"("adminId", "method", "path", "key");
CREATE INDEX "admin_idempotency_records_expiresAt_idx" ON "admin_idempotency_records"("expiresAt");
ALTER TABLE "admin_idempotency_records" ADD CONSTRAINT "admin_idempotency_records_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
