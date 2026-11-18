import { afterEach, expect, it, vi } from 'vitest';
import { FeatureKey, FeatureType, PrismaClient } from '@prisma/client';
import { TenantFeatureService } from '../../../src/services/tenant-feature.service.js';
import { StoragePlanResolver } from '../../../src/modules/storage-accounting/domain/storage-plan.js';
import type { ResolvedFeature } from '../../../src/types/feature.types.js';

afterEach(() => vi.restoreAllMocks());
it('resolves a consistent storage plan in one feature batch while preserving overrides and validation', async () => {
  const features: ResolvedFeature[] = ([
    [FeatureKey.CHAT_ENABLED, 'true'], [FeatureKey.STORAGE_LIMIT_BYTES, '10240'],
    [FeatureKey.CHAT_FILE_MAX_BYTES, '1024'], [FeatureKey.CHAT_ATTACHMENTS_PER_MESSAGE, '2'],
    [FeatureKey.CHAT_MAX_GROUP_MEMBERS, '10'], [FeatureKey.CHAT_RETENTION_DAYS, 'unlimited'],
    [FeatureKey.CHAT_AUDIT_LEVEL, 'advanced'],
  ] as const).map(([featureKey, value]) => ({ featureKey, value, isEnabled: true, isOverride: true, type: FeatureType.LIMIT }));
  const batch = vi.spyOn(TenantFeatureService.prototype, 'resolveAllFeatures').mockResolvedValue(features);
  const single = vi.spyOn(TenantFeatureService.prototype, 'resolveFeature').mockImplementation(async (_tenant, key) => {
    const feature = features.find((feature) => feature.featureKey === key); if (!feature) throw new Error('Missing synthetic feature.'); return feature;
  });
  const db = new PrismaClient();
  try {
    const resolver = new StoragePlanResolver(db);
    expect(await resolver.resolve('synthetic')).toMatchObject({ enabled: true, storageLimitBytes: 10240n, chatFileMaxBytes: 1024, chatRetentionDays: null, chatAuditLevel: 'advanced' });
    expect(batch).toHaveBeenCalledTimes(1); expect(single).not.toHaveBeenCalled();
    batch.mockResolvedValue(features.map((feature) => feature.featureKey === FeatureKey.STORAGE_LIMIT_BYTES ? { ...feature, value: 'NaN' } : feature));
    await expect(resolver.resolve('synthetic')).rejects.toThrow('plan ayarı');
  } finally { await db.$disconnect(); }
});
