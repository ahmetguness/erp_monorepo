'use client';

import { useQuery } from '@tanstack/react-query';
import {
  PLAN,
  PLAN_FEATURE_DEFINITIONS,
  PLAN_FEATURES,
  type ModuleKey,
  type PlanFeatureFlags,
  type PlanName,
} from '@/lib/plans';
import { getResolvedFeatures, type ResolvedFeature } from '@/services/feature.service';
import { useAuthStore } from '@/store/auth.store';

export interface PlanFeatures extends PlanFeatureFlags {
  plan: PlanName | null;
  isStarter: boolean;
  isProfessional: boolean;
  isEnterprise: boolean;
  hasResolvedFeatures: boolean;
}

type PlanFeatureFlag = keyof PlanFeatureFlags;

const MODULE_FEATURE_OVERRIDES: Partial<Record<ModuleKey, Partial<PlanFeatureFlags>>> = {
  warehouse: { multiWarehouse: true },
  purchasing: { purchasing: true },
  production: { production: true },
  service: { service: true },
  marketplace: { marketplace: true },
  payroll: { payroll: true },
  hr: { hr: true },
  approvals: { approvals: true },
  documents: { documentCenter: true },
  workflow: { workflowCenter: true },
  mail: { mailCenter: true },
};

const FEATURE_FLAG_BY_KEY = Object.fromEntries(
  PLAN_FEATURE_DEFINITIONS.map((definition) => [definition.featureKey, definition.flag]),
) as Record<string, PlanFeatureFlag>;

export function usePlanFeatures(): PlanFeatures {
  const tenant = useAuthStore((s) => s.tenant);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const plan = tenant?.plan ?? null;
  const modules = tenant?.modules ?? [];
  const selectedPlan = plan ?? PLAN.STARTER;

  const { data: resolvedFeatures } = useQuery({
    queryKey: ['tenant', 'resolved-features', tenant?.id],
    queryFn: getResolvedFeatures,
    enabled: isAuthenticated && Boolean(tenant?.id),
    staleTime: 60_000,
  });

  const fallbackFeatures = buildFallbackFeatures(selectedPlan, modules);
  const hasResolvedFeatures = resolvedFeatures !== undefined;
  const featureFlags = applyResolvedFeatures(fallbackFeatures, resolvedFeatures ?? []);

  return {
    ...featureFlags,
    plan,
    isStarter: selectedPlan === PLAN.STARTER,
    isProfessional: selectedPlan === PLAN.PROFESSIONAL,
    isEnterprise: selectedPlan === PLAN.ENTERPRISE,
    hasResolvedFeatures,
  };
}

export type FeatureFlag = keyof Omit<
  PlanFeatures,
  'plan' | 'isStarter' | 'isProfessional' | 'isEnterprise' | 'hasResolvedFeatures' | 'maxUsers' | 'maxProducts'
>;

export function useCanAccess(feature: FeatureFlag): boolean {
  const features = usePlanFeatures();
  return Boolean(features[feature]);
}

function buildFallbackFeatures(plan: PlanName, modules: readonly string[]): PlanFeatureFlags {
  const baseFeatures = PLAN_FEATURES[plan];
  const moduleOverrides = modules.reduce<Partial<PlanFeatureFlags>>((acc, module) => {
    const override = MODULE_FEATURE_OVERRIDES[normalizeModule(module)];
    return override ? { ...acc, ...override } : acc;
  }, {});

  return {
    ...baseFeatures,
    ...moduleOverrides,
  };
}

function applyResolvedFeatures(
  fallbackFeatures: PlanFeatureFlags,
  resolvedFeatures: readonly ResolvedFeature[],
): PlanFeatureFlags {
  return resolvedFeatures.reduce<PlanFeatureFlags>((features, feature) => {
    const flag = FEATURE_FLAG_BY_KEY[feature.featureKey];
    if (!flag) return features;

    return {
      ...features,
      [flag]: resolveFeatureFlagValue(flag, feature, features[flag]),
    };
  }, fallbackFeatures);
}

function resolveFeatureFlagValue(
  flag: PlanFeatureFlag,
  feature: ResolvedFeature,
  fallbackValue: PlanFeatureFlags[PlanFeatureFlag],
): PlanFeatureFlags[PlanFeatureFlag] {
  if (typeof fallbackValue === 'number' || fallbackValue === null) {
    return parseLimitValue(feature.value);
  }

  if (feature.type === 'ENUM') {
    return feature.isEnabled && feature.value !== 'basic';
  }

  return feature.isEnabled && feature.value === 'true';
}

function parseLimitValue(value: string): number | null {
  if (value === 'unlimited') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeModule(module: string): ModuleKey {
  return module.toLowerCase() as ModuleKey;
}
