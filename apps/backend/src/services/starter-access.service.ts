import { FeatureKey, Prisma, PrismaClient } from '@prisma/client';
import { ModuleKey } from '../types/module.types';
import { FeatureDisabledError, LimitExceededError, ModuleDisabledError } from '../errors';
import { TenantFeatureService } from './tenant-feature.service';
import { parseBooleanValue, parseLimitValue } from '../utils/feature-parser';
import { hasTenantModuleAccess } from '../utils/tenant-modules';

export interface PlanLimitCapacity {
  currentCount: number;
  limit: number | null;
  remainingSlots: number | null;
  requestedCount: number;
  allowed: boolean;
}

type StarterAccessDbClient = PrismaClient | Prisma.TransactionClient;

export class StarterAccessService {
  private readonly tenantFeatureService: TenantFeatureService;

  constructor(private readonly prisma: StarterAccessDbClient) {
    this.tenantFeatureService = new TenantFeatureService(prisma);
  }

  async getUserCapacity(tenantId: string, requestedCount = 1, currentCount?: number): Promise<PlanLimitCapacity> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, FeatureKey.MAX_USERS);
    const limitResult = parseLimitValue(feature.value);
    const resolvedCurrentCount = currentCount ?? await this.prisma.tenantUser.count({
      where: { tenantId, isActive: true },
    });

    return buildCapacity(resolvedCurrentCount, requestedCount, limitResult.isUnlimited ? null : limitResult.limit);
  }

  async enforceUserLimit(tenantId: string): Promise<void> {
    await this.enforceUserCapacity(tenantId, 1);
  }

  async enforceUserCapacity(tenantId: string, requestedCount: number, currentCount?: number): Promise<void> {
    const capacity = await this.getUserCapacity(tenantId, requestedCount, currentCount);
    if (capacity.limit !== null && !capacity.allowed) {
      throw new LimitExceededError('Kullanici', capacity.limit, capacity.currentCount + requestedCount);
    }
  }

  async getProductCapacity(tenantId: string, requestedCount = 1, currentCount?: number): Promise<PlanLimitCapacity> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, FeatureKey.MAX_PRODUCTS);
    const limitResult = parseLimitValue(feature.value);
    const resolvedCurrentCount = currentCount ?? await this.prisma.product.count({
      where: { tenantId, deletedAt: null },
    });

    return buildCapacity(resolvedCurrentCount, requestedCount, limitResult.isUnlimited ? null : limitResult.limit);
  }

  async enforceProductLimit(tenantId: string): Promise<void> {
    await this.enforceProductCapacity(tenantId, 1);
  }

  async enforceProductCapacity(tenantId: string, requestedCount: number, currentCount?: number): Promise<void> {
    const capacity = await this.getProductCapacity(tenantId, requestedCount, currentCount);
    if (capacity.limit !== null && !capacity.allowed) {
      throw new LimitExceededError('Urun', capacity.limit, capacity.currentCount + requestedCount);
    }
  }

  async enforceWarehouseCreation(tenantId: string, requestedCount = 1, currentCount?: number): Promise<void> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, FeatureKey.MULTI_WAREHOUSE);
    const isMultiWarehouseEnabled = parseBooleanValue(feature.value) && feature.isEnabled;
    if (isMultiWarehouseEnabled) return;

    const warehouseCount = currentCount ?? await this.prisma.warehouse.count({ where: { tenantId } });
    if (warehouseCount + requestedCount > 1) {
      throw new FeatureDisabledError('MULTI_WAREHOUSE');
    }
  }

  async enforceWarehouseTransfer(tenantId: string): Promise<void> {
    const feature = await this.tenantFeatureService.resolveFeature(tenantId, FeatureKey.MULTI_WAREHOUSE);
    const isMultiWarehouseEnabled = parseBooleanValue(feature.value) && feature.isEnabled;
    if (!isMultiWarehouseEnabled) {
      throw new FeatureDisabledError('MULTI_WAREHOUSE');
    }
  }

  async enforceModuleAccess(tenantId: string, module: ModuleKey): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true, modules: true },
    });

    if (hasTenantModuleAccess(tenant, module)) return;
    throw new ModuleDisabledError(module);
  }

  async enforceFeatureAccess(tenantId: string, featureKey: FeatureKey): Promise<void> {
    const isEnabled = await this.tenantFeatureService.isFeatureEnabled(tenantId, featureKey);
    if (!isEnabled) {
      throw new FeatureDisabledError(featureKey);
    }
  }
}

function buildCapacity(currentCount: number, requestedCount: number, limit: number | null): PlanLimitCapacity {
  if (limit === null) {
    return { currentCount, limit: null, remainingSlots: null, requestedCount, allowed: true };
  }

  const remainingSlots = Math.max(0, limit - currentCount);
  return {
    currentCount,
    limit,
    remainingSlots,
    requestedCount,
    allowed: requestedCount <= remainingSlots,
  };
}
