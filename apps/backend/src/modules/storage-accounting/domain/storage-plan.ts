import { FeatureKey, type PrismaClient } from '@prisma/client';
import { ValidationError } from '../../../errors/index.js';
import { TenantFeatureService } from '../../../services/tenant-feature.service.js';

export interface StoragePlanLimits {
  enabled: boolean;
  storageLimitBytes: bigint;
  chatFileMaxBytes: number;
  chatAttachmentsPerMessage: number;
  chatMaxGroupMembers: number;
  chatRetentionDays: number | null;
  chatAuditLevel: 'basic' | 'advanced' | 'enterprise';
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new ValidationError(`${label} plan ayarı geçersiz.`);
  return parsed;
}

function positiveBigInt(value: string, label: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error('not-positive');
    return parsed;
  } catch {
    throw new ValidationError(`${label} plan ayarı geçersiz.`);
  }
}

export class StoragePlanResolver {
  private readonly features: TenantFeatureService;

  constructor(prisma: PrismaClient) {
    this.features = new TenantFeatureService(prisma);
  }

  async resolve(tenantId: string): Promise<StoragePlanLimits> {
    const [enabled, storage, file, attachments, members, retention, audit] = await Promise.all([
      this.features.resolveFeature(tenantId, FeatureKey.CHAT_ENABLED),
      this.features.resolveFeature(tenantId, FeatureKey.STORAGE_LIMIT_BYTES),
      this.features.resolveFeature(tenantId, FeatureKey.CHAT_FILE_MAX_BYTES),
      this.features.resolveFeature(tenantId, FeatureKey.CHAT_ATTACHMENTS_PER_MESSAGE),
      this.features.resolveFeature(tenantId, FeatureKey.CHAT_MAX_GROUP_MEMBERS),
      this.features.resolveFeature(tenantId, FeatureKey.CHAT_RETENTION_DAYS),
      this.features.resolveFeature(tenantId, FeatureKey.CHAT_AUDIT_LEVEL),
    ]);
    const auditLevel = audit.value;
    if (auditLevel !== 'basic' && auditLevel !== 'advanced' && auditLevel !== 'enterprise') {
      throw new ValidationError('Sohbet audit plan ayarı geçersiz.');
    }
    return {
      enabled: enabled.isEnabled && enabled.value === 'true',
      storageLimitBytes: positiveBigInt(storage.value, 'Depolama limiti'),
      chatFileMaxBytes: positiveInteger(file.value, 'Dosya boyutu limiti'),
      chatAttachmentsPerMessage: positiveInteger(attachments.value, 'Mesaj dosya limiti'),
      chatMaxGroupMembers: positiveInteger(members.value, 'Grup üye limiti'),
      chatRetentionDays: retention.value === 'unlimited' ? null : positiveInteger(retention.value, 'Saklama süresi'),
      chatAuditLevel: auditLevel,
    };
  }
}
