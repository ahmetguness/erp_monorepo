-- Support bounded tenant/time scans without sorting a tenant's entire event history.
-- The release wrapper holds a transaction-scoped deployment lock. CONCURRENTLY
-- would wait for that transaction while the wrapper waits for this migration.
-- A regular index works with that lock; schedule a write pause for a large outbox.
CREATE INDEX "chat_realtime_outbox_tenantId_createdAt_id_idx"
ON "chat_realtime_outbox" ("tenantId", "createdAt", "id");
