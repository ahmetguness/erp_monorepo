INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid(), 'manual-applied', NOW(), '20260503170316_add_marketplace_sync_webhook_snapshot', NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260503170316_add_marketplace_sync_webhook_snapshot'
);
