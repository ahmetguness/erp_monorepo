INSERT INTO "observability_slos" ("id", "name", "scope", "scopeId", "metricKey", "targetPercentage", "windowDays", "owner", "runbookUrl", "notificationChannel", "isEnabled", "createdAt", "updatedAt") VALUES
('slo-backend-availability', 'Backend availability', 'SERVICE', 'backend', 'availability_pct', 99.900, 30, 'platform-operations', 'https://runbooks.local/backend-availability', 'ops-alerts', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('slo-backend-queue-health', 'Backend queue health', 'SERVICE', 'backend', 'queue_health_pct', 99.500, 7, 'platform-operations', 'https://runbooks.local/queue-health', 'ops-alerts', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("scope", "scopeId", "metricKey") DO NOTHING;
