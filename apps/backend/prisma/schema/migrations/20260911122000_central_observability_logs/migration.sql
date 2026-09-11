CREATE TABLE "observability_log_entries" ("id" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "level" TEXT NOT NULL, "service" TEXT NOT NULL, "message" TEXT NOT NULL, "requestId" TEXT, "correlationId" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "observability_log_entries_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "observability_log_entries_fingerprint_key" ON "observability_log_entries"("fingerprint");
CREATE INDEX "observability_log_entries_service_occurredAt_idx" ON "observability_log_entries"("service", "occurredAt");
CREATE INDEX "observability_log_entries_requestId_idx" ON "observability_log_entries"("requestId");
CREATE INDEX "observability_log_entries_correlationId_idx" ON "observability_log_entries"("correlationId");
