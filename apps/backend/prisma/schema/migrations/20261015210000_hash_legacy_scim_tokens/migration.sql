CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "tenant_settings"
SET "value" = 'sha256:' || encode(digest("value", 'sha256'), 'hex')
WHERE "key" = 'security.scim.token'
  AND "value" LIKE 'scim\_%' ESCAPE '\';
