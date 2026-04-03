import { FeatureType } from '@prisma/client';
import { FeatureLimitResult, UNLIMITED_VALUE } from '../types/feature.types';

// ─────────────────────────────────────────────
// Feature Parser Utilities
// ─────────────────────────────────────────────

/**
 * LIMIT tipindeki feature value'sunu sayısal limite çevirir.
 * "unlimited" → null (sınırsız)
 * Geçersiz değer → null (restrictive: sınırsız değil, 0 kabul et)
 */
export function parseLimitValue(value: string): FeatureLimitResult {
  if (value.toLowerCase() === UNLIMITED_VALUE) {
    return { limit: null, isUnlimited: true };
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed < 0) {
    // Bilinmeyen değer → restrictive davran (0 limit)
    return { limit: 0, isUnlimited: false };
  }

  return { limit: parsed, isUnlimited: false };
}

/**
 * BOOLEAN tipindeki feature value'sunu boolean'a çevirir.
 * Bilinmeyen değer → false (restrictive)
 */
export function parseBooleanValue(value: string): boolean {
  return value.toLowerCase() === 'true';
}

/**
 * Feature type'a göre value'yu parse eder.
 */
export function parseFeatureValue(
  type: FeatureType,
  value: string,
): boolean | FeatureLimitResult | string {
  switch (type) {
    case FeatureType.BOOLEAN:
      return parseBooleanValue(value);
    case FeatureType.LIMIT:
      return parseLimitValue(value);
    case FeatureType.ENUM:
      return value;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Limit değerini aşıp aşmadığını kontrol eder.
 * limit null ise (unlimited) → her zaman false döner
 */
export function isLimitExceeded(current: number, limitResult: FeatureLimitResult): boolean {
  if (limitResult.isUnlimited || limitResult.limit === null) {
    return false;
  }
  return current >= limitResult.limit;
}

/**
 * Limit değerini aşıp aşmadığını ham string value ile kontrol eder.
 */
export function checkLimitFromValue(current: number, value: string): boolean {
  const limitResult = parseLimitValue(value);
  return isLimitExceeded(current, limitResult);
}
