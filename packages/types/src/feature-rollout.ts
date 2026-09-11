import type { FeatureKeyName, PlanName } from "./plans.js";

export const FEATURE_ENVIRONMENTS = [
  "DEVELOPMENT",
  "STAGING",
  "PRODUCTION",
] as const;
export type FeatureEnvironment = (typeof FEATURE_ENVIRONMENTS)[number];
export const FEATURE_ROLLOUT_STAGES = [
  "DEVELOPMENT",
  "INTERNAL",
  "PILOT",
  "PERCENTAGE",
  "GENERAL",
] as const;
export type FeatureRolloutStage = (typeof FEATURE_ROLLOUT_STAGES)[number];
export const FEATURE_ROLLOUT_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ROLLED_BACK",
] as const;
export type FeatureRolloutStatus = (typeof FEATURE_ROLLOUT_STATUSES)[number];

export interface FeatureRollout {
  id: string;
  plan: PlanName;
  featureKey: FeatureKeyName;
  version: number;
  environment: FeatureEnvironment;
  stage: FeatureRolloutStage;
  status: FeatureRolloutStatus;
  value: string;
  isEnabled: boolean;
  rolloutPercentage: number;
  targetTenantIds: string[];
  dependencies: FeatureKeyName[];
  conflicts: FeatureKeyName[];
  startsAt: string;
  endsAt: string | null;
  errorThresholdPct: number;
  observedErrorRatePct: number | null;
  killSwitch: boolean;
  reason: string;
  createdById: string;
  activatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeatureRolloutInput {
  plan: PlanName;
  featureKey: FeatureKeyName;
  environment: FeatureEnvironment;
  stage: FeatureRolloutStage;
  value: string;
  isEnabled: boolean;
  rolloutPercentage: number;
  targetTenantIds: string[];
  dependencies: FeatureKeyName[];
  conflicts: FeatureKeyName[];
  startsAt: string;
  endsAt?: string | null;
  errorThresholdPct: number;
  reason: string;
  ticketId?: string;
}
