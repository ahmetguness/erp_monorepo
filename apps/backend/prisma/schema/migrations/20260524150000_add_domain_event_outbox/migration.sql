CREATE TYPE "DomainEventOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

CREATE TABLE "domain_event_outbox" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "entityType" "EntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "context" JSONB NOT NULL,
  "status" "DomainEventOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "failedListeners" JSONB,
  "nextRetryAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "domain_event_outbox_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "domain_event_outbox"
  ADD CONSTRAINT "domain_event_outbox_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "domain_event_outbox_tenantId_idempotencyKey_key"
  ON "domain_event_outbox"("tenantId", "idempotencyKey");

CREATE INDEX "domain_event_outbox_tenantId_status_createdAt_idx"
  ON "domain_event_outbox"("tenantId", "status", "createdAt");

CREATE INDEX "domain_event_outbox_tenantId_name_createdAt_idx"
  ON "domain_event_outbox"("tenantId", "name", "createdAt");

CREATE INDEX "domain_event_outbox_tenantId_entityType_entityId_idx"
  ON "domain_event_outbox"("tenantId", "entityType", "entityId");
