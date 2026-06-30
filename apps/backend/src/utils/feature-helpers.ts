import { FeatureKey } from '@prisma/client';
import { ResolvedFeature, STARTER_FEATURE_DEFAULTS } from '../types/feature.types';
import { parseBooleanValue, parseLimitValue } from './feature-parser';

// ─────────────────────────────────────────────
// Feature Helper Utilities
// ─────────────────────────────────────────────

/**
 * ResolvedFeature listesinden belirli bir key'i bulur.
 * Bulunamazsa default olarak kapalı/0 döner.
 */
export function findFeature(
  features: ResolvedFeature[],
  key: FeatureKey,
): ResolvedFeature | undefined {
  return features.find((f) => f.featureKey === key);
}

/**
 * Feature'ın boolean değerini döner.
 * Feature bulunamazsa → false (restrictive)
 */
export function getFeatureBoolean(features: ResolvedFeature[], key: FeatureKey): boolean {
  const feature = findFeature(features, key);
  if (!feature || !feature.isEnabled) return false;
  return parseBooleanValue(feature.value);
}

/**
 * Feature'ın limit değerini döner.
 * Feature bulunamazsa → 0 (restrictive)
 */
export function getFeatureLimit(features: ResolvedFeature[], key: FeatureKey): number | null {
  const feature = findFeature(features, key);
  if (!feature || !feature.isEnabled) return 0;
  const result = parseLimitValue(feature.value);
  return result.isUnlimited ? null : result.limit;
}

/**
 * Starter plan default değerini döner.
 * DB'de kayıt yoksa fallback olarak kullanılır.
 */
export function getStarterDefault(key: FeatureKey): string {
  return STARTER_FEATURE_DEFAULTS[key] ?? 'false';
}

/**
 * Tenant modüller listesinde verilen modülün aktif olup olmadığını kontrol eder.
 * modules alanı string[] (legacy) olduğundan lowercase karşılaştırma ve alias kontrolü yapılır.
 */
export function isModuleInList(modules: readonly string[], module: string): boolean {
  if (!modules || modules.length === 0) return false;
  const normalized = modules.map((m) => String(m).toLowerCase());
  const req = module.toLowerCase();
  if (req === 'sales') return normalized.includes('sales') || normalized.includes('invoicing') || normalized.includes('contacts');
  if (req === 'crm') return normalized.includes('crm') || normalized.includes('contacts');
  if (req === 'inventory') return normalized.includes('inventory') || normalized.includes('warehouse');
  if (req === 'warehouse') return normalized.includes('warehouse') || normalized.includes('inventory');
  if (req === 'mail') return normalized.includes('mail') || normalized.includes('mailcenter');
  return normalized.includes(req);
}

/**
 * Hono context'inden tenantId'yi güvenli şekilde alır.
 */
export function extractTenantId(
  variables: Record<string, unknown>,
  headerValue?: string,
): string | null {
  if (typeof variables['tenantId'] === 'string') {
    return variables['tenantId'];
  }
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }
  return null;
}
