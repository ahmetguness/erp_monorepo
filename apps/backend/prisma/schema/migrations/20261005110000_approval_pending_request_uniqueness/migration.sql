-- An entity may have only one pending request in the same approval flow.
-- A partial index preserves completed audit history and permits a later approval cycle.
CREATE UNIQUE INDEX "approval_requests_one_pending_per_flow_entity"
ON "approval_requests" ("tenantId", "flowId", "entityType", "entityId")
WHERE "status" = 'PENDING';
