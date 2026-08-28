ALTER TYPE "SyncJobStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

ALTER TABLE "marketplace_sync_jobs"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

ALTER TABLE "domain_event_outbox"
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "marketplace_sync_jobs_status_nextRetryAt_createdAt_idx" ON "marketplace_sync_jobs"("status", "nextRetryAt", "createdAt");
CREATE INDEX "marketplace_sync_jobs_status_leaseExpiresAt_idx" ON "marketplace_sync_jobs"("status", "leaseExpiresAt");
CREATE INDEX "domain_event_outbox_status_nextRetryAt_createdAt_idx" ON "domain_event_outbox"("status", "nextRetryAt", "createdAt");
CREATE INDEX "domain_event_outbox_status_leaseExpiresAt_idx" ON "domain_event_outbox"("status", "leaseExpiresAt");
