ALTER TABLE "observability_alert_history"
ADD COLUMN "silenceReason" TEXT,
ADD COLUMN "lastModifiedById" TEXT;

CREATE INDEX "observability_alert_history_lastModifiedById_idx"
ON "observability_alert_history"("lastModifiedById");
