ALTER TYPE "AdminChangeRequestType" ADD VALUE 'FEATURE_ROLLOUT_ACTIVATE';
CREATE TABLE "feature_rollouts" (
  "id" TEXT NOT NULL, "plan" "Plan" NOT NULL, "featureKey" "FeatureKey" NOT NULL,
  "version" INTEGER NOT NULL, "environment" TEXT NOT NULL, "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "value" TEXT NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "rolloutPercentage" INTEGER NOT NULL DEFAULT 0, "targetTenantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[], "conflicts" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3), "errorThresholdPct" DECIMAL(5,2) NOT NULL,
  "observedErrorRatePct" DECIMAL(5,2), "killSwitch" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL, "ticketId" TEXT, "createdById" TEXT NOT NULL, "activatedById" TEXT,
  "activatedAt" TIMESTAMP(3), "pausedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "feature_rollouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feature_rollouts_plan_featureKey_environment_version_key" ON "feature_rollouts"("plan", "featureKey", "environment", "version");
CREATE INDEX "feature_rollouts_plan_featureKey_environment_status_idx" ON "feature_rollouts"("plan", "featureKey", "environment", "status");
CREATE INDEX "feature_rollouts_status_startsAt_endsAt_idx" ON "feature_rollouts"("status", "startsAt", "endsAt");
