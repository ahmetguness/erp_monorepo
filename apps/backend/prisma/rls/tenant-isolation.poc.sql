-- Proof of concept only. Do not apply until each request/transaction sets:
--   SET LOCAL app.tenant_id = '<tenant-id>';
-- Administrative maintenance may explicitly set app.tenant_bypass = 'true'.

BEGIN;

DO $policy$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Contact', 'Invoice', 'StockMovement']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
         current_setting(''app.tenant_bypass'', true) = ''true''
         OR "tenantId" = current_setting(''app.tenant_id'', true)
       ) WITH CHECK (
         current_setting(''app.tenant_bypass'', true) = ''true''
         OR "tenantId" = current_setting(''app.tenant_id'', true)
       )',
      table_name
    );
  END LOOP;
END
$policy$;

ROLLBACK;
