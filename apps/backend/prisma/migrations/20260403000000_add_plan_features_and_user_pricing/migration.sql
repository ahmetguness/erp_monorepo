-- Migration: add_plan_features_and_user_pricing
-- Changes:
--   1. Tenant.maxUsers: NOT NULL DEFAULT 3 -> nullable (drop default + drop not null)
--   2. Tenant.userPrice: new nullable Decimal(10,2) column
--   3. PlanFeature: new table for plan-based feature management

-- 1. Make maxUsers nullable (remove default and not-null constraint)
ALTER TABLE "tenants" ALTER COLUMN "max_users" DROP DEFAULT;
ALTER TABLE "tenants" ALTER COLUMN "max_users" DROP NOT NULL;

-- 2. Add userPrice column
ALTER TABLE "tenants" ADD COLUMN "user_price" DECIMAL(10,2);

-- 3. Create plan_features table
CREATE TABLE "plan_features" (
    "id"         TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "plan"        "Plan" NOT NULL,
    "key"         TEXT NOT NULL,
    "value"       TEXT NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- 4. Unique constraint on (plan, key)
CREATE UNIQUE INDEX "plan_features_plan_key_key" ON "plan_features"("plan", "key");

-- 5. Index on plan
CREATE INDEX "plan_features_plan_idx" ON "plan_features"("plan");
