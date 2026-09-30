-- A stock movement may produce at most one valuation ledger row per warehouse.
-- Transfers intentionally produce one source and one destination valuation.
-- PostgreSQL unique constraints allow multiple NULL values, preserving manual valuations.
CREATE UNIQUE INDEX "stock_valuations_movementId_warehouseId_key"
ON "stock_valuations"("movementId", "warehouseId");
