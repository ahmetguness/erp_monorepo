'use client';

import { useAuthStore } from '@/store/auth.store';

// Plan enum — packages/types ile senkron
const Plan = { STARTER: 'STARTER', PROFESSIONAL: 'PROFESSIONAL', ENTERPRISE: 'ENTERPRISE' } as const;
type PlanType = (typeof Plan)[keyof typeof Plan];

// ─────────────────────────────────────────────
// Starter plan limits
// ─────────────────────────────────────────────

interface PlanFeatures {
  plan: PlanType | null;
  isStarter: boolean;
  isProfessional: boolean;
  isEnterprise: boolean;
  // Feature flags
  multiWarehouse: boolean;
  maxUsers: number | null;
  maxProducts: number | null;
  purchasing: boolean;
  production: boolean;
  service: boolean;
  marketplace: boolean;
  payroll: boolean;
  hr: boolean;
  approvals: boolean;
  apiAccess: boolean;
  advancedAuditLog: boolean;
  customReporting: boolean;
}

const STARTER_FEATURES: PlanFeatures = {
  plan: Plan.STARTER,
  isStarter: true,
  isProfessional: false,
  isEnterprise: false,
  multiWarehouse: false,
  maxUsers: 5,
  maxProducts: 500,
  purchasing: false,
  production: false,
  service: false,
  marketplace: false,
  payroll: false,
  hr: false,
  approvals: false,
  apiAccess: false,
  advancedAuditLog: false,
  customReporting: false,
};

const PROFESSIONAL_FEATURES: PlanFeatures = {
  plan: Plan.PROFESSIONAL,
  isStarter: false,
  isProfessional: true,
  isEnterprise: false,
  multiWarehouse: true,
  maxUsers: 25,
  maxProducts: 5000,
  purchasing: true,
  production: false,
  service: true,
  marketplace: false,
  payroll: false,
  hr: true,
  approvals: true,
  apiAccess: true,
  advancedAuditLog: true,
  customReporting: true,
};

const ENTERPRISE_FEATURES: PlanFeatures = {
  plan: Plan.ENTERPRISE,
  isStarter: false,
  isProfessional: false,
  isEnterprise: true,
  multiWarehouse: true,
  maxUsers: null,
  maxProducts: null,
  purchasing: true,
  production: true,
  service: true,
  marketplace: true,
  payroll: true,
  hr: true,
  approvals: true,
  apiAccess: true,
  advancedAuditLog: true,
  customReporting: true,
};

export function usePlanFeatures(): PlanFeatures {
  const tenant = useAuthStore((s) => s.tenant);
  const plan = tenant?.plan ?? null;

  switch (plan) {
    case Plan.ENTERPRISE: return ENTERPRISE_FEATURES;
    case Plan.PROFESSIONAL: return PROFESSIONAL_FEATURES;
    case Plan.STARTER:
    default: return STARTER_FEATURES;
  }
}

/**
 * Belirli bir özelliğin mevcut planda aktif olup olmadığını kontrol eder.
 */
export function useCanAccess(feature: keyof Omit<PlanFeatures, 'plan' | 'isStarter' | 'isProfessional' | 'isEnterprise' | 'maxUsers' | 'maxProducts'>): boolean {
  const features = usePlanFeatures();
  return features[feature] as boolean;
}
