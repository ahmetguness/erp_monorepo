CREATE UNIQUE INDEX "attachments_logical_version_unique"
ON "attachments" (
  "tenantId",
  "entityType",
  "entityId",
  COALESCE("documentKind", 'GENERAL'),
  REGEXP_REPLACE(LOWER("fileName"), '\.[^.]*$', ''),
  "version"
);
