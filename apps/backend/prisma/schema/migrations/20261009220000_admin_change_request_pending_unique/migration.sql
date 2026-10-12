CREATE UNIQUE INDEX "admin_change_requests_pending_target_unique"
ON "admin_change_requests" ("type", "targetId")
WHERE "status" = 'PENDING';
