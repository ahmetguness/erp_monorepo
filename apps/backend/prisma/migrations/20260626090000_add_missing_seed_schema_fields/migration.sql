DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeatureType') THEN
    CREATE TYPE "FeatureType" AS ENUM ('BOOLEAN', 'LIMIT', 'ENUM');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeatureKey') THEN
    CREATE TYPE "FeatureKey" AS ENUM (
      'MAX_USERS',
      'MAX_PRODUCTS',
      'MULTI_WAREHOUSE',
      'ROLE_MANAGEMENT',
      'APPROVALS',
      'CRM',
      'SALES',
      'PURCHASING',
      'PRODUCTION',
      'SERVICE',
      'MARKETPLACE',
      'PAYROLL',
      'HR',
      'API_ACCESS',
      'AUDIT_LOG',
      'CUSTOM_REPORTING'
    );
  END IF;
END $$;

ALTER TABLE "plan_features"
  ADD COLUMN IF NOT EXISTS "type" "FeatureType" NOT NULL DEFAULT 'LIMIT',
  ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "featureKey" "FeatureKey";

CREATE UNIQUE INDEX IF NOT EXISTS "plan_features_plan_featureKey_key"
  ON "plan_features"("plan", "featureKey");
