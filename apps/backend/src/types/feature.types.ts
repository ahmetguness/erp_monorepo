import { FeatureKey, FeatureType, Plan } from '@prisma/client';
import { STARTER_OPEN_MODULES as SHARED_STARTER_OPEN_MODULES } from '@repo/types/plans';

// ─────────────────────────────────────────────
// Feature Types
// ─────────────────────────────────────────────

export { FeatureKey, FeatureType };

export interface ResolvedFeature {
  featureKey: FeatureKey;
  value: string;
  isEnabled: boolean;
  type: FeatureType;
  /** true = TenantFeatureOverride'dan geldi, false = PlanFeature'dan */
  isOverride: boolean;
}

export interface FeatureLimitResult {
  limit: number | null; // null = unlimited
  isUnlimited: boolean;
}

export interface FeatureBooleanResult {
  isEnabled: boolean;
}

export type FeatureResolutionSource = 'override' | 'plan' | 'default';

export interface FeatureResolution {
  featureKey: FeatureKey;
  value: string;
  isEnabled: boolean;
  source: FeatureResolutionSource;
}

// ─────────────────────────────────────────────
// Starter Plan Feature Defaults
// ─────────────────────────────────────────────

export const STARTER_FEATURE_DEFAULTS: Record<FeatureKey, string> = {
  [FeatureKey.MAX_USERS]: '5',
  [FeatureKey.MAX_PRODUCTS]: '500',
  [FeatureKey.MULTI_WAREHOUSE]: 'false',
  [FeatureKey.ROLE_MANAGEMENT]: 'false',
  [FeatureKey.APPROVALS]: 'false',
  [FeatureKey.CRM]: 'true',
  [FeatureKey.SALES]: 'true',
  [FeatureKey.PURCHASING]: 'false',
  [FeatureKey.PRODUCTION]: 'false',
  [FeatureKey.SERVICE]: 'false',
  [FeatureKey.MARKETPLACE]: 'false',
  [FeatureKey.PAYROLL]: 'false',
  [FeatureKey.HR]: 'false',
  [FeatureKey.API_ACCESS]: 'false',
  [FeatureKey.AUDIT_LOG]: 'basic',
  [FeatureKey.CUSTOM_REPORTING]: 'false',
  [FeatureKey.DOCUMENT_CENTER]: 'true',
};

export const UNLIMITED_VALUE = 'unlimited';

// ─────────────────────────────────────────────
// Plan → Feature Key mapping (Starter açık modüller)
// ─────────────────────────────────────────────

export const STARTER_OPEN_MODULES: readonly string[] = [
  ...SHARED_STARTER_OPEN_MODULES,
];

export const STARTER_CLOSED_MODULES: readonly string[] = [
  'purchasing',
  'production',
  'service',
  'marketplace',
  'payroll',
  'hr',
  'crm',
  'approvals',
  'api_access',
  'audit_log',
  'multi_warehouse',
] as const;
