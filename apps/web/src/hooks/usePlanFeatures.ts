'use client';

import { useAuthStore } from '@/store/auth.store';

// Plan enum — packages/types ile senkron
const Plan = { STARTER: 'STARTER', PROFESSIONAL: 'PROFESSIONAL', ENTERPRISE: 'ENTERPRISE' } as const;
type PlanType = (typeof Plan)[keyof typeof Plan];

// ─────────────────────────────────────────────
// Starter plan limits
// ─────────────────────────────────────────────

export interface PlanFeatures {
  plan: PlanType | null;
  isStarter: boolean;
  isProfessional: boolean;
  isEnterprise: boolean;
  // Feature flags
  multiWarehouse: boolean;
  maxUsers: number | null;
  maxProducts: number | null;
  roleManagement: boolean;
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
  documentCenter: boolean;
  smartNotifications: boolean;
  workflowCenter: boolean;
  mailCenter: boolean;
}

const STARTER_FEATURES: PlanFeatures = {
  plan: Plan.STARTER,
  isStarter: true,
  isProfessional: false,
  isEnterprise: false,
  multiWarehouse: false,
  maxUsers: 5,
  maxProducts: 500,
  roleManagement: false,
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
  documentCenter: true,
  smartNotifications: true,
  workflowCenter: false,
  mailCenter: false,
};

const PROFESSIONAL_FEATURES: PlanFeatures = {
  plan: Plan.PROFESSIONAL,
  isStarter: false,
  isProfessional: true,
  isEnterprise: false,
  multiWarehouse: true,
  maxUsers: 25,
  maxProducts: 5000,
  roleManagement: true,
  purchasing: true,
  production: false,
  service: false,
  marketplace: false,
  payroll: false,
  hr: true,
  approvals: true,
  apiAccess: true,
  advancedAuditLog: true,
  customReporting: true,
  documentCenter: true,
  smartNotifications: true,
  workflowCenter: true,
  mailCenter: false,
};

const ENTERPRISE_FEATURES: PlanFeatures = {
  plan: Plan.ENTERPRISE,
  isStarter: false,
  isProfessional: false,
  isEnterprise: true,
  multiWarehouse: true,
  maxUsers: null,
  maxProducts: null,
  roleManagement: true,
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
  documentCenter: true,
  smartNotifications: true,
  workflowCenter: true,
  mailCenter: true,
};

export function usePlanFeatures(): PlanFeatures {
  const tenant = useAuthStore((s) => s.tenant);
  const plan = tenant?.plan ?? null;
  const modules = tenant?.modules ?? [];

  let baseFeatures: PlanFeatures;
  switch (plan) {
    case Plan.ENTERPRISE: baseFeatures = ENTERPRISE_FEATURES; break;
    case Plan.PROFESSIONAL: baseFeatures = PROFESSIONAL_FEATURES; break;
    case Plan.STARTER:
    default: baseFeatures = STARTER_FEATURES; break;
  }

  if (modules.length > 0) {
    const overrideFeatures: Partial<PlanFeatures> = {};
    if (modules.includes('inventory') || modules.includes('warehouse')) overrideFeatures.multiWarehouse = true;
    if (modules.includes('roles')) overrideFeatures.roleManagement = true;
    if (modules.includes('purchasing')) overrideFeatures.purchasing = true;
    if (modules.includes('production')) overrideFeatures.production = true;
    if (modules.includes('service')) overrideFeatures.service = true;
    if (modules.includes('marketplace')) overrideFeatures.marketplace = true;
    if (modules.includes('payroll')) overrideFeatures.payroll = true;
    if (modules.includes('hr')) overrideFeatures.hr = true;
    if (modules.includes('approvals')) overrideFeatures.approvals = true;
    if (modules.includes('documents')) overrideFeatures.documentCenter = true;
    if (modules.includes('workflow')) overrideFeatures.workflowCenter = true;
    if (modules.includes('mail')) overrideFeatures.mailCenter = true;
    
    return { ...baseFeatures, ...overrideFeatures };
  }

  return baseFeatures;
}

/**
 * Belirli bir özelliğin mevcut planda aktif olup olmadığını kontrol eder.
 */
export function useCanAccess(feature: keyof Omit<PlanFeatures, 'plan' | 'isStarter' | 'isProfessional' | 'isEnterprise' | 'maxUsers' | 'maxProducts'>): boolean {
  const features = usePlanFeatures();
  return features[feature] as boolean;
}
