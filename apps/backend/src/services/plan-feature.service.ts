import { FeatureKey, FeatureType, Plan, PrismaClient } from '@prisma/client';
import { ResolvedFeature, STARTER_FEATURE_DEFAULTS } from '../types/feature.types';
import { parseBooleanValue } from '../utils/feature-parser';

// ─────────────────────────────────────────────
// Plan Feature Service
// Sorumluluğu: PlanFeature tablosundan plan bazlı feature'ları çözmek
// ─────────────────────────────────────────────

export class PlanFeatureService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Belirli bir plan için tüm feature'ları DB'den çeker.
   * DB'de kayıt yoksa STARTER_FEATURE_DEFAULTS'a düşer.
   */
  async getPlanFeatures(plan: Plan): Promise<ResolvedFeature[]> {
    const planFeatures = await this.prisma.planFeature.findMany({
      where: { plan },
    });

    // FeatureKey enum değerlerini iterate et, her biri için çözüm üret
    const resolved: ResolvedFeature[] = Object.values(FeatureKey).map((key) => {
      const dbFeature = planFeatures.find((pf) => pf.featureKey === key);

      if (dbFeature) {
        return {
          featureKey: key,
          value: dbFeature.value,
          isEnabled: dbFeature.isEnabled,
          type: dbFeature.type,
          isOverride: false,
        };
      }

      // DB'de kayıt yok → default değer kullan
      const defaultValue = STARTER_FEATURE_DEFAULTS[key] ?? 'false';
      return {
        featureKey: key,
        value: defaultValue,
        isEnabled: parseBooleanValue(defaultValue) || defaultValue !== 'false',
        type: FeatureType.BOOLEAN,
        isOverride: false,
      };
    });

    return resolved;
  }

  /**
   * Belirli bir plan + feature key için tek feature çözer.
   */
  async getPlanFeature(plan: Plan, featureKey: FeatureKey): Promise<ResolvedFeature> {
    const dbFeature = await this.prisma.planFeature.findUnique({
      where: { plan_featureKey: { plan, featureKey } },
    });

    if (dbFeature) {
      return {
        featureKey,
        value: dbFeature.value,
        isEnabled: dbFeature.isEnabled,
        type: dbFeature.type,
        isOverride: false,
      };
    }

    const defaultValue = STARTER_FEATURE_DEFAULTS[featureKey] ?? 'false';
    return {
      featureKey,
      value: defaultValue,
      isEnabled: defaultValue !== 'false',
      type: FeatureType.BOOLEAN,
      isOverride: false,
    };
  }
}
