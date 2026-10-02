-- PostgreSQL exclusion constraints are not expressible in Prisma schema syntax.
-- Prevent overlapping inclusive fiscal-period ranges even under concurrent writes.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "fiscal_periods"
ADD CONSTRAINT "fiscal_periods_tenant_date_range_excl"
EXCLUDE USING gist (
  "tenantId" WITH =,
  daterange("startDate", "endDate", '[]') WITH &&
);
