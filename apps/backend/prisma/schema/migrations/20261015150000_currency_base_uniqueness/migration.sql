-- One tenant can have at most one base currency. Partial uniqueness keeps
-- non-base currency rows unrestricted while closing concurrent insert races.
CREATE UNIQUE INDEX "currencies_one_base_per_tenant_key"
ON "currencies" ("tenantId")
WHERE "isBase" = true;
