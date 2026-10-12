INSERT INTO "admin_inbox_task_states" ("id", "sourceType", "sourceId", "ownerId", "resolvedAt", "createdAt", "updatedAt")
SELECT 'migrated-' || "id", "sourceType", "sourceId", "ownerId", "resolvedAt", "createdAt", "updatedAt"
FROM "admin_inbox_item_states"
WHERE "ownerId" IS NOT NULL OR "resolvedAt" IS NOT NULL
ON CONFLICT ("sourceType", "sourceId") DO UPDATE SET
  "ownerId" = COALESCE("admin_inbox_task_states"."ownerId", EXCLUDED."ownerId"),
  "resolvedAt" = COALESCE("admin_inbox_task_states"."resolvedAt", EXCLUDED."resolvedAt"),
  "updatedAt" = GREATEST("admin_inbox_task_states"."updatedAt", EXCLUDED."updatedAt");

DELETE FROM "admin_inbox_item_states" state
WHERE NOT EXISTS (SELECT 1 FROM "admin_users" admin WHERE admin."id" = state."adminId");
DELETE FROM "admin_inbox_preferences" preference
WHERE NOT EXISTS (SELECT 1 FROM "admin_users" admin WHERE admin."id" = preference."adminId");
UPDATE "admin_inbox_item_states" state SET "ownerId" = NULL
WHERE state."ownerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "admin_users" admin WHERE admin."id" = state."ownerId");
UPDATE "admin_inbox_task_states" state SET "ownerId" = NULL
WHERE state."ownerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "admin_users" admin WHERE admin."id" = state."ownerId");

ALTER TABLE "admin_inbox_item_states"
  ADD CONSTRAINT "admin_inbox_item_states_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "admin_inbox_item_states_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_inbox_preferences"
  ADD CONSTRAINT "admin_inbox_preferences_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_inbox_task_states"
  ADD CONSTRAINT "admin_inbox_task_states_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
