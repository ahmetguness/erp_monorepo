CREATE TYPE "StorageReservationSource" AS ENUM ('CHAT_ATTACHMENT', 'ERP_ATTACHMENT');
CREATE TYPE "StorageReservationStatus" AS ENUM ('RESERVED', 'UPLOADED', 'SCANNING', 'COMMITTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "tenant_storage_usage" (
  "tenantId" TEXT NOT NULL,
  "usedBytes" BIGINT NOT NULL DEFAULT 0,
  "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_storage_usage_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "storage_reservations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "source" "StorageReservationSource" NOT NULL,
  "status" "StorageReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "objectKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expectedBytes" BIGINT NOT NULL,
  "resourceId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "uploadedAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "storage_reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "storage_traffic_daily" (
  "tenantId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "uploadedBytes" BIGINT NOT NULL DEFAULT 0,
  "downloadedBytes" BIGINT NOT NULL DEFAULT 0,
  "uploadCount" INTEGER NOT NULL DEFAULT 0,
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "storage_traffic_daily_pkey" PRIMARY KEY ("tenantId", "day")
);

CREATE UNIQUE INDEX "storage_reservations_objectKey_key" ON "storage_reservations"("objectKey");
CREATE INDEX "storage_reservations_tenantId_status_expiresAt_idx" ON "storage_reservations"("tenantId", "status", "expiresAt");
CREATE INDEX "storage_reservations_status_updatedAt_idx" ON "storage_reservations"("status", "updatedAt");
CREATE INDEX "storage_traffic_daily_day_downloadedBytes_idx" ON "storage_traffic_daily"("day", "downloadedBytes");

ALTER TABLE "tenant_storage_usage" ADD CONSTRAINT "tenant_storage_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storage_reservations" ADD CONSTRAINT "storage_reservations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storage_traffic_daily" ADD CONSTRAINT "storage_traffic_daily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "tenant_storage_usage" ("tenantId", "usedBytes", "reservedBytes", "version", "createdAt", "updatedAt")
SELECT t."id",
       COALESCE(a."bytes", 0) + COALESCE(ca."bytes", 0),
       0,
       0,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "tenants" t
LEFT JOIN (SELECT "tenantId", SUM("fileSize")::BIGINT AS "bytes" FROM "attachments" GROUP BY "tenantId") a ON a."tenantId" = t."id"
LEFT JOIN (SELECT "tenantId", SUM("sizeBytes")::BIGINT AS "bytes" FROM "chat_attachments" WHERE "status" = 'READY' AND "deletedAt" IS NULL GROUP BY "tenantId") ca ON ca."tenantId" = t."id";

INSERT INTO "plan_features" ("id", "plan", "key", "featureKey", "value", "type", "isEnabled", "createdAt", "updatedAt")
SELECT CONCAT('storage-', LOWER(p."plan"::TEXT), '-', p."key"), p."plan"::"Plan", p."key", p."featureKey"::"FeatureKey", p."value", p."type"::"FeatureType", TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('STARTER', 'chat_enabled', 'CHAT_ENABLED', 'true', 'BOOLEAN'),
  ('STARTER', 'storage_limit_bytes', 'STORAGE_LIMIT_BYTES', '524288000', 'LIMIT'),
  ('STARTER', 'chat_file_max_bytes', 'CHAT_FILE_MAX_BYTES', '5242880', 'LIMIT'),
  ('STARTER', 'chat_attachments_per_message', 'CHAT_ATTACHMENTS_PER_MESSAGE', '3', 'LIMIT'),
  ('STARTER', 'chat_max_group_members', 'CHAT_MAX_GROUP_MEMBERS', '20', 'LIMIT'),
  ('STARTER', 'chat_retention_days', 'CHAT_RETENTION_DAYS', '90', 'LIMIT'),
  ('STARTER', 'chat_audit_level', 'CHAT_AUDIT_LEVEL', 'basic', 'ENUM'),
  ('PROFESSIONAL', 'chat_enabled', 'CHAT_ENABLED', 'true', 'BOOLEAN'),
  ('PROFESSIONAL', 'storage_limit_bytes', 'STORAGE_LIMIT_BYTES', '10737418240', 'LIMIT'),
  ('PROFESSIONAL', 'chat_file_max_bytes', 'CHAT_FILE_MAX_BYTES', '26214400', 'LIMIT'),
  ('PROFESSIONAL', 'chat_attachments_per_message', 'CHAT_ATTACHMENTS_PER_MESSAGE', '5', 'LIMIT'),
  ('PROFESSIONAL', 'chat_max_group_members', 'CHAT_MAX_GROUP_MEMBERS', '100', 'LIMIT'),
  ('PROFESSIONAL', 'chat_retention_days', 'CHAT_RETENTION_DAYS', '365', 'LIMIT'),
  ('PROFESSIONAL', 'chat_audit_level', 'CHAT_AUDIT_LEVEL', 'advanced', 'ENUM'),
  ('ENTERPRISE', 'chat_enabled', 'CHAT_ENABLED', 'true', 'BOOLEAN'),
  ('ENTERPRISE', 'storage_limit_bytes', 'STORAGE_LIMIT_BYTES', '107374182400', 'LIMIT'),
  ('ENTERPRISE', 'chat_file_max_bytes', 'CHAT_FILE_MAX_BYTES', '104857600', 'LIMIT'),
  ('ENTERPRISE', 'chat_attachments_per_message', 'CHAT_ATTACHMENTS_PER_MESSAGE', '10', 'LIMIT'),
  ('ENTERPRISE', 'chat_max_group_members', 'CHAT_MAX_GROUP_MEMBERS', '250', 'LIMIT'),
  ('ENTERPRISE', 'chat_retention_days', 'CHAT_RETENTION_DAYS', 'unlimited', 'LIMIT'),
  ('ENTERPRISE', 'chat_audit_level', 'CHAT_AUDIT_LEVEL', 'enterprise', 'ENUM')
) AS p("plan", "key", "featureKey", "value", "type")
ON CONFLICT ("plan", "key") DO UPDATE SET "featureKey" = EXCLUDED."featureKey", "value" = EXCLUDED."value", "type" = EXCLUDED."type", "isEnabled" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;
