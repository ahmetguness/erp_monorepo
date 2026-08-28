-- CreateTable: marketplace_sync_jobs
CREATE TABLE "marketplace_sync_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "params" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: marketplace_webhook_events
CREATE TABLE "marketplace_webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: marketplace_listing_snapshots
CREATE TABLE "marketplace_listing_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "lastSentQty" INTEGER NOT NULL,
    "lastSentSalePrice" DECIMAL(18,2) NOT NULL,
    "lastSentListPrice" DECIMAL(18,2) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "batchRequestId" TEXT,

    CONSTRAINT "marketplace_listing_snapshots_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "marketplace_sync_jobs_tenantId_integrationId_status_idx"
    ON "marketplace_sync_jobs"("tenantId", "integrationId", "status");
CREATE INDEX "marketplace_sync_jobs_tenantId_jobType_status_idx"
    ON "marketplace_sync_jobs"("tenantId", "jobType", "status");
CREATE INDEX "marketplace_sync_jobs_createdAt_idx"
    ON "marketplace_sync_jobs"("createdAt");

CREATE UNIQUE INDEX "marketplace_webhook_events_integrationId_eventId_key"
    ON "marketplace_webhook_events"("integrationId", "eventId");
CREATE INDEX "marketplace_webhook_events_tenantId_processedAt_idx"
    ON "marketplace_webhook_events"("tenantId", "processedAt");

CREATE UNIQUE INDEX "marketplace_listing_snapshots_listingId_key"
    ON "marketplace_listing_snapshots"("listingId");
CREATE INDEX "marketplace_listing_snapshots_tenantId_idx"
    ON "marketplace_listing_snapshots"("tenantId");

-- Foreign Keys
ALTER TABLE "marketplace_sync_jobs"
    ADD CONSTRAINT "marketplace_sync_jobs_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "marketplace_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_sync_jobs"
    ADD CONSTRAINT "marketplace_sync_jobs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_webhook_events"
    ADD CONSTRAINT "marketplace_webhook_events_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "marketplace_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_webhook_events"
    ADD CONSTRAINT "marketplace_webhook_events_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_listing_snapshots"
    ADD CONSTRAINT "marketplace_listing_snapshots_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_listing_snapshots"
    ADD CONSTRAINT "marketplace_listing_snapshots_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
