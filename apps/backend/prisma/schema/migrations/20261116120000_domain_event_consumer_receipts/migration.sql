CREATE UNIQUE INDEX "domain_event_outbox_tenantId_id_key" ON "domain_event_outbox"("tenantId", "id");

CREATE TABLE "domain_event_deliveries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "consumer" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "domain_event_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "domain_event_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "domain_event_deliveries_tenantId_outboxId_fkey" FOREIGN KEY ("tenantId", "outboxId") REFERENCES "domain_event_outbox"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "domain_event_deliveries_tenantId_outboxId_consumer_key" ON "domain_event_deliveries"("tenantId", "outboxId", "consumer");
CREATE INDEX "domain_event_deliveries_tenantId_completedAt_idx" ON "domain_event_deliveries"("tenantId", "completedAt");

ALTER TABLE "mail_messages" ADD COLUMN "deliveryPayload" JSONB, ADD COLUMN "deliveryStartedAt" TIMESTAMP(3);
