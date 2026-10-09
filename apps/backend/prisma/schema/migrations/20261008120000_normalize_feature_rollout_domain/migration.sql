-- Normalize values written by the legacy/demo seed to the current rollout domain.
UPDATE "feature_rollouts"
SET "environment" = UPPER("environment")
WHERE "environment" IN ('development', 'staging', 'production');

UPDATE "feature_rollouts"
SET "stage" = 'PERCENTAGE'
WHERE "stage" = 'BETA';
