-- Historical compatibility migration.
--
-- This repository later introduced 20260403134435_add_plan_features_and_user_pricing,
-- which creates the full multi-tenant schema from scratch. On a clean shadow
-- database, this earlier migration runs before the tenants table and Plan enum
-- exist, so it must be a no-op in that case. On older local databases where
-- tenants already exists, keep the original intent idempotent and guarded.

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tenants'
        AND column_name = 'max_users'
    ) THEN
      ALTER TABLE "tenants" ALTER COLUMN "max_users" DROP DEFAULT;
      ALTER TABLE "tenants" ALTER COLUMN "max_users" DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tenants'
        AND column_name = 'maxUsers'
    ) THEN
      ALTER TABLE "tenants" ALTER COLUMN "maxUsers" DROP DEFAULT;
      ALTER TABLE "tenants" ALTER COLUMN "maxUsers" DROP NOT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tenants'
        AND column_name IN ('user_price', 'userPrice')
    ) THEN
      ALTER TABLE "tenants" ADD COLUMN "userPrice" DECIMAL(10,2);
    END IF;
  END IF;

  IF to_regtype('public."Plan"') IS NOT NULL
     AND to_regclass('public.plan_features') IS NULL THEN
    CREATE TABLE "plan_features" (
      "id" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "plan" "Plan" NOT NULL,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
    );

    CREATE UNIQUE INDEX "plan_features_plan_key_key" ON "plan_features"("plan", "key");
    CREATE INDEX "plan_features_plan_idx" ON "plan_features"("plan");
  END IF;
END $$;
