import { FeatureKey, Plan, PrismaClient } from '@prisma/client';
import { parseBooleanValue, parseLimitValue } from '../utils/feature-parser';
import { TenantFeatureService } from './tenant-feature.service';

const BYTES_IN_GB = 1024 * 1024 * 1024;

const STORAGE_LIMIT_BYTES: Record<Plan, number | null> = {
  [Plan.STARTER]: BYTES_IN_GB,
  [Plan.PROFESSIONAL]: 10 * BYTES_IN_GB,
  [Plan.ENTERPRISE]: null,
};

export type PlanUsageMetricKey = 'users' | 'products' | 'warehouses' | 'apiKeys' | 'storage';
export type PlanUsageUnit = 'count' | 'bytes';
export type PlanUsageStatus = 'ok' | 'warning' | 'full' | 'unlimited';

export interface PlanUsageMetric {
  key: PlanUsageMetricKey;
  label: string;
  used: number;
  limit: number | null;
  unit: PlanUsageUnit;
  percent: number | null;
  status: PlanUsageStatus;
  locked: boolean;
  reason: string | null;
}

export interface PlanUsageSummary {
  tenantId: string;
  plan: Plan;
  generatedAt: string;
  metrics: PlanUsageMetric[];
}

interface CountSnapshot {
  users: number;
  products: number;
  warehouses: number;
  apiKeys: number;
  storageBytes: number;
}

export class PlanUsageService {
  private readonly tenantFeatureService: TenantFeatureService;

  constructor(private readonly prisma: PrismaClient) {
    this.tenantFeatureService = new TenantFeatureService(prisma);
  }

  async getSummary(tenantId: string): Promise<PlanUsageSummary> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true },
    });

    const [counts, maxUsers, maxProducts, multiWarehouse, apiAccess] = await Promise.all([
      this.getCountSnapshot(tenantId),
      this.getLimit(tenantId, FeatureKey.MAX_USERS),
      this.getLimit(tenantId, FeatureKey.MAX_PRODUCTS),
      this.getBoolean(tenantId, FeatureKey.MULTI_WAREHOUSE),
      this.getBoolean(tenantId, FeatureKey.API_ACCESS),
    ]);

    return {
      tenantId,
      plan: tenant.plan,
      generatedAt: new Date().toISOString(),
      metrics: [
        buildMetric({
          key: 'users',
          label: 'Kullanici',
          used: counts.users,
          limit: maxUsers,
          unit: 'count',
          reason: maxUsers === null ? null : 'Plan kullanici limiti doldu.',
        }),
        buildMetric({
          key: 'products',
          label: 'Urun',
          used: counts.products,
          limit: maxProducts,
          unit: 'count',
          reason: maxProducts === null ? null : 'Plan urun limiti doldu.',
        }),
        buildMetric({
          key: 'warehouses',
          label: 'Depo',
          used: counts.warehouses,
          limit: multiWarehouse ? null : 1,
          unit: 'count',
          reason: multiWarehouse ? null : 'Coklu depo bu planda kapali.',
        }),
        buildMetric({
          key: 'apiKeys',
          label: 'API anahtari',
          used: counts.apiKeys,
          limit: apiAccess ? null : 0,
          unit: 'count',
          reason: apiAccess ? null : 'API erisimi bu planda kapali.',
        }),
        buildMetric({
          key: 'storage',
          label: 'Storage',
          used: counts.storageBytes,
          limit: STORAGE_LIMIT_BYTES[tenant.plan],
          unit: 'bytes',
          reason: STORAGE_LIMIT_BYTES[tenant.plan] === null ? null : 'Storage kotasi doldu.',
        }),
      ],
    };
  }

  private async getCountSnapshot(tenantId: string): Promise<CountSnapshot> {
    const [users, products, warehouses, apiKeys, attachmentSize] = await this.prisma.$transaction([
      this.prisma.tenantUser.count({ where: { tenantId, isActive: true } }),
      this.prisma.product.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.warehouse.count({ where: { tenantId } }),
      this.prisma.apiKey.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.attachment.aggregate({
        where: { tenantId },
        _sum: { fileSize: true },
      }),
    ]);

    return {
      users,
      products,
      warehouses,
      apiKeys,
      storageBytes: attachmentSize._sum.fileSize ?? 0,
    };
  }

  private async getLimit(tenantId: string, featureKey: FeatureKey): Promise<number | null> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, featureKey);
    if (!feature.isEnabled) return 0;
    const parsed = parseLimitValue(feature.value);
    return parsed.isUnlimited ? null : parsed.limit;
  }

  private async getBoolean(tenantId: string, featureKey: FeatureKey): Promise<boolean> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, featureKey);
    return feature.isEnabled && parseBooleanValue(feature.value);
  }
}

function buildMetric(input: Omit<PlanUsageMetric, 'percent' | 'status' | 'locked'>): PlanUsageMetric {
  const percent = calculatePercent(input.used, input.limit);
  const status = getStatus(input.used, input.limit, percent);
  const locked = input.limit !== null && input.used >= input.limit;

  return {
    ...input,
    percent,
    status,
    locked,
    reason: locked ? input.reason : null,
  };
}

function calculatePercent(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function getStatus(used: number, limit: number | null, percent: number | null): PlanUsageStatus {
  if (limit === null) return 'unlimited';
  if (used >= limit) return 'full';
  if ((percent ?? 0) >= 80) return 'warning';
  return 'ok';
}
