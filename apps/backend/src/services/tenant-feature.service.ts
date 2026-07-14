import { FeatureKey, FeatureType, Plan, Prisma, PrismaClient } from '@prisma/client';
import { ResolvedFeature, STARTER_FEATURE_DEFAULTS } from '../types/feature.types';
import { parseBooleanValue } from '../utils/feature-parser';
import { PlanFeatureService } from './plan-feature.service';

// ─────────────────────────────────────────────
// Tenant Feature Service
// Sorumluluğu: Tenant bazlı feature çözümleme
// Önce TenantFeatureOverride → sonra PlanFeature → sonra default
// ─────────────────────────────────────────────

export class TenantFeatureService {
  private readonly planFeatureService: PlanFeatureService;

  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {
    this.planFeatureService = new PlanFeatureService(prisma);
  }

  /**
   * Tenant için tüm feature'ları çözer.
   * Override varsa ve süresi dolmamışsa override kullanılır.
   */
  async resolveAllFeatures(tenantId: string): Promise<ResolvedFeature[]> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true },
    });

    const [planFeatures, overrides] = await Promise.all([
      this.planFeatureService.getPlanFeatures(tenant.plan),
      this.prisma.tenantFeatureOverride.findMany({
        where: {
          tenantId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);

    return planFeatures.map((planFeature) => {
      const override = overrides.find((o) => o.featureKey === planFeature.featureKey);

      if (override) {
        return {
          featureKey: planFeature.featureKey,
          value: override.value,
          isEnabled: override.isEnabled,
          type: planFeature.type,
          isOverride: true,
        };
      }

      return planFeature;
    });
  }

  /**
   * Tenant için tek bir feature çözer.
   */
  async resolveFeature(tenantId: string, featureKey: FeatureKey): Promise<ResolvedFeature> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true },
    });

    const override = await this.prisma.tenantFeatureOverride.findFirst({
      where: {
        tenantId,
        featureKey,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (override) {
      const planFeature = await this.planFeatureService.getPlanFeature(tenant.plan, featureKey);
      return {
        featureKey,
        value: override.value,
        isEnabled: override.isEnabled,
        type: planFeature.type,
        isOverride: true,
      };
    }

    return this.planFeatureService.getPlanFeature(tenant.plan, featureKey);
  }

  /**
   * Tenant'ın belirli bir feature'ı aktif olup olmadığını kontrol eder.
   */
  async isFeatureEnabled(tenantId: string, featureKey: FeatureKey): Promise<boolean> {
    const feature = await this.resolveFeature(tenantId, featureKey);
    if (!feature.isEnabled) return false;
    if (feature.type === FeatureType.BOOLEAN) {
      return parseBooleanValue(feature.value);
    }
    // LIMIT veya ENUM tipinde → isEnabled yeterli
    return feature.isEnabled;
  }

  /**
   * Tenant'ın plan bilgisini döner.
   */
  async getTenantPlan(tenantId: string): Promise<Plan> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true },
    });
    return tenant.plan;
  }
}
