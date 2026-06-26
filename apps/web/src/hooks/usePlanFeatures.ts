'use client';

import {
  PLAN,
  PLAN_FEATURES,
  type ModuleKey,
  type PlanFeatureFlags,
  type PlanName,
} from '@/lib/plans';
import { useAuthStore } from '@/store/auth.store';

export interface PlanFeatures extends PlanFeatureFlags {
  plan: PlanName | null;
  isStarter: boolean;
  isProfessional: boolean;
  isEnterprise: boolean;
}

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

export function usePlanFeatures(): PlanFeatures {
  const tenant = useAuthStore((s) => s.tenant);
  const plan = tenant?.plan ?? null;
  const modules = tenant?.modules ?? [];

  const selectedPlan = plan ?? PLAN.STARTER;
  const baseFeatures = PLAN_FEATURES[selectedPlan];
  const moduleOverrides = modules.reduce<Partial<PlanFeatureFlags>>((acc, module) => {
    const override = MODULE_FEATURE_OVERRIDES[normalizeModule(module)];
    return override ? { ...acc, ...override } : acc;
  }, {});

  return {
    ...baseFeatures,
    ...moduleOverrides,
    plan,
    isStarter: selectedPlan === PLAN.STARTER,
    isProfessional: selectedPlan === PLAN.PROFESSIONAL,
    isEnterprise: selectedPlan === PLAN.ENTERPRISE,
  };
}

export type FeatureFlag = keyof Omit<
  PlanFeatures,
  'plan' | 'isStarter' | 'isProfessional' | 'isEnterprise' | 'maxUsers' | 'maxProducts'
>;

export function useCanAccess(feature: FeatureFlag): boolean {
  const features = usePlanFeatures();
  return Boolean(features[feature]);
}

function normalizeModule(module: string): ModuleKey {
  return module.toLowerCase() as ModuleKey;
}
