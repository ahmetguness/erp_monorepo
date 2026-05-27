ALTER TABLE "domain_event_outbox"
ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
