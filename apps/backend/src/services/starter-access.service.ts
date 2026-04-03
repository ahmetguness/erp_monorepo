import { FeatureKey, PrismaClient } from '@prisma/client';
import { STARTER_OPEN_MODULES } from '../types/feature.types';
import { ModuleKey } from '../types/module.types';
import { LimitExceededError, FeatureDisabledError, ModuleDisabledError } from '../errors';
import { TenantFeatureService } from './tenant-feature.service';
import { parseLimitValue, parseBooleanValue } from '../utils/feature-parser';
import { isModuleInList } from '../utils/feature-helpers';

// ─────────────────────────────────────────────
// Starter Access Service
// Sorumluluğu: Starter plan iş kurallarını enforce etmek
// ─────────────────────────────────────────────

export class StarterAccessService {
  private readonly tenantFeatureService: TenantFeatureService;

  constructor(private readonly prisma: PrismaClient) {
    this.tenantFeatureService = new TenantFeatureService(prisma);
  }

  // ─── Kullanıcı Limiti ───────────────────────

  /**
   * Yeni kullanıcı eklemeden önce MAX_USERS limitini kontrol eder.
   * Limit aşılmışsa LimitExceededError fırlatır.
   */
  async enforceUserLimit(tenantId: string): Promise<void> {
    const feature = await this.tenantFeatureService.resolveFeature(
      tenantId,
      FeatureKey.MAX_USERS,
    );

    const limitResult = parseLimitValue(feature.value);
    if (limitResult.isUnlimited) return;

    const currentCount = await this.prisma.tenantUser.count({
      where: { tenantId, isActive: true },
    });

    if (limitResult.limit !== null && currentCount >= limitResult.limit) {
      throw new LimitExceededError('Kullanıcı', limitResult.limit, currentCount);
    }
  }

  // ─── Ürün Limiti ────────────────────────────

  /**
   * Yeni ürün eklemeden önce MAX_PRODUCTS limitini kontrol eder.
   * Limit aşılmışsa LimitExceededError fırlatır.
   */
  async enforceProductLimit(tenantId: string): Promise<void> {
    const feature = await this.tenantFeatureService.resolveFeature(
      tenantId,
      FeatureKey.MAX_PRODUCTS,
    );

    const limitResult = parseLimitValue(feature.value);
    if (limitResult.isUnlimited) return;

    const currentCount = await this.prisma.product.count({
      where: { tenantId, deletedAt: null },
    });

    if (limitResult.limit !== null && currentCount >= limitResult.limit) {
      throw new LimitExceededError('Ürün', limitResult.limit, currentCount);
    }
  }

  // ─── Depo Kuralı ────────────────────────────

  /**
   * MULTI_WAREHOUSE false ise ikinci depo oluşturulmasını engeller.
   */
  async enforceWarehouseCreation(tenantId: string): Promise<void> {
    const feature = await this.tenantFeatureService.resolveFeature(
      tenantId,
      FeatureKey.MULTI_WAREHOUSE,
    );

    const isMultiWarehouseEnabled = parseBooleanValue(feature.value) && feature.isEnabled;
    if (isMultiWarehouseEnabled) return;

    const warehouseCount = await this.prisma.warehouse.count({
      where: { tenantId },
    });

    if (warehouseCount >= 1) {
      throw new FeatureDisabledError('MULTI_WAREHOUSE');
    }
  }

  /**
   * MULTI_WAREHOUSE false ise depo transfer işlemlerini engeller.
   */
  async enforceWarehouseTransfer(tenantId: string): Promise<void> {
    const feature = await this.tenantFeatureService.resolveFeature(
      tenantId,
      FeatureKey.MULTI_WAREHOUSE,
    );

    const isMultiWarehouseEnabled = parseBooleanValue(feature.value) && feature.isEnabled;
    if (!isMultiWarehouseEnabled) {
      throw new FeatureDisabledError('MULTI_WAREHOUSE');
    }
  }

  // ─── Modül Erişimi ──────────────────────────

  /**
   * Tenant'ın belirli bir modüle erişimi olup olmadığını kontrol eder.
   * Kapalı modüle erişimde ModuleDisabledError fırlatır.
   */
  async enforceModuleAccess(tenantId: string, module: ModuleKey): Promise<void> {
    // Starter plan için açık modüller statik olarak tanımlı
    if (isModuleInList([...STARTER_OPEN_MODULES], module)) {
      // Açık modül → DB'den tenant modules listesini de kontrol et
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { modules: true },
      });

      // Tenant modules listesi boşsa açık modüllere izin ver
      if (tenant.modules.length === 0 || isModuleInList(tenant.modules, module)) {
        return;
      }
    }

    // Kapalı modül veya tenant listesinde yok
    throw new ModuleDisabledError(module);
  }

  // ─── Feature Erişimi ────────────────────────

  /**
   * Belirli bir feature'ın aktif olup olmadığını kontrol eder.
   * Kapalıysa FeatureDisabledError fırlatır.
   */
  async enforceFeatureAccess(tenantId: string, featureKey: FeatureKey): Promise<void> {
    const isEnabled = await this.tenantFeatureService.isFeatureEnabled(tenantId, featureKey);
    if (!isEnabled) {
      throw new FeatureDisabledError(featureKey);
    }
  }
}
