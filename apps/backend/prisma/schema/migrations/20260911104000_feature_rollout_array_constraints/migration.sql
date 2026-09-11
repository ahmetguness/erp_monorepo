UPDATE "feature_rollouts" SET "targetTenantIds" = ARRAY[]::TEXT[] WHERE "targetTenantIds" IS NULL;
UPDATE "feature_rollouts" SET "dependencies" = ARRAY[]::TEXT[] WHERE "dependencies" IS NULL;
UPDATE "feature_rollouts" SET "conflicts" = ARRAY[]::TEXT[] WHERE "conflicts" IS NULL;
ALTER TABLE "feature_rollouts" ALTER COLUMN "targetTenantIds" SET NOT NULL;
ALTER TABLE "feature_rollouts" ALTER COLUMN "dependencies" SET NOT NULL;
ALTER TABLE "feature_rollouts" ALTER COLUMN "conflicts" SET NOT NULL;
