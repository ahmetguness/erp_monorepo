import { createHash } from 'crypto';
import { AuditAction, EntityType, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { getDataRetentionSettings } from './data-retention-policy.service.js';
import { getSiemSettings } from './siem-export.service.js';
import { resolveAuditLogPolicy } from './audit-log-policy.service.js';

export const AUDIT_LOG_FULL_SETTING_KEYS = {
  immutableEnabled: 'security.audit_full.immutable_enabled',
  lastImmutableHash: 'security.audit_full.last_immutable_hash',
  lastImmutableLogId: 'security.audit_full.last_immutable_log_id',
} as const;

export interface AuditLogIntegrityPayload {
  immutable: true;
  algorithm: 'sha256';
  chainVersion: 1;
  previousLogId: string | null;
  previousHash: string | null;
  hash: string;
  generatedAt: string;
}

export interface AuditLogFullStatus {
  generatedAt: string;
  auditLevel: string;
  retention: {
    enabled: boolean;
    auditLogRule: {
      retentionDays: number | null;
      action: string;
      legalArchive: boolean;
      enabled: boolean;
    } | null;
  };
  exportApi: {
    enabled: boolean;
    maxRows: number;
    href: string;
  };
  siemPush: {
    enabled: boolean;
    destinationType: string;
    minSeverity: string;
    lastExportAt: string | null;
    lastStatus: string | null;
  };
  immutable: {
    enabled: boolean;
    lastLogId: string | null;
    lastHash: string | null;
  };
}

type AuditFullDbClient = Pick<PrismaClient, 'tenant' | 'tenantFeatureOverride' | 'tenantSetting' | 'auditLog'>;
type NullableAuditJsonInput = Prisma.InputJsonValue | typeof Prisma.JsonNull;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function toHash(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}

function toJsonObject(value: NullableAuditJsonInput | undefined): Prisma.InputJsonObject {
  if (value === undefined || value === Prisma.JsonNull) return {};
  const jsonValue = value as Prisma.InputJsonValue;
  if (!isRecord(jsonValue)) return { value: jsonValue };
  return jsonValue as Prisma.InputJsonObject;
}

export async function getAuditImmutableSettings(db: AuditFullDbClient, tenantId: string): Promise<AuditLogFullStatus['immutable']> {
  const settings = await db.tenantSetting.findMany({
    where: {
      tenantId,
      key: {
        in: [
          AUDIT_LOG_FULL_SETTING_KEYS.immutableEnabled,
          AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableHash,
          AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableLogId,
        ],
      },
    },
    select: { key: true, value: true },
  });
  const map = new Map(settings.map((setting) => [setting.key, setting.value]));
  return {
    enabled: map.get(AUDIT_LOG_FULL_SETTING_KEYS.immutableEnabled) === 'true',
    lastLogId: map.get(AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableLogId) ?? null,
    lastHash: map.get(AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableHash) ?? null,
  };
}

export async function setAuditImmutableEnabled(db: AuditFullDbClient, tenantId: string, enabled: boolean): Promise<AuditLogFullStatus['immutable']> {
  await db.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: AUDIT_LOG_FULL_SETTING_KEYS.immutableEnabled } },
    create: { tenantId, key: AUDIT_LOG_FULL_SETTING_KEYS.immutableEnabled, value: enabled ? 'true' : 'false' },
    update: { value: enabled ? 'true' : 'false' },
  });
  return getAuditImmutableSettings(db, tenantId);
}

export async function withAuditIntegrityMetadata(
  db: AuditFullDbClient,
  input: {
    tenantId: string;
    module: string;
    entityType: EntityType;
    entityId: string;
    action: AuditAction;
    userId: string | null;
    oldValues?: Prisma.InputJsonValue;
    newValues?: Prisma.InputJsonValue;
    ipAddress: string | null;
    userAgent: string | null;
  },
): Promise<{ oldValues: NullableAuditJsonInput; newValues: NullableAuditJsonInput; integrity: AuditLogIntegrityPayload | null }> {
  const immutable = await getAuditImmutableSettings(db, input.tenantId);
  const oldValues = input.oldValues ?? Prisma.JsonNull;
  const newValues = input.newValues ?? Prisma.JsonNull;
  if (!immutable.enabled) return { oldValues, newValues, integrity: null };

  const generatedAt = new Date().toISOString();
  const basePayload = {
    tenantId: input.tenantId,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    userId: input.userId,
    oldValues,
    newValues,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    previousLogId: immutable.lastLogId,
    previousHash: immutable.lastHash,
    generatedAt,
  };
  const integrity: AuditLogIntegrityPayload = {
    immutable: true,
    algorithm: 'sha256',
    chainVersion: 1,
    previousLogId: immutable.lastLogId,
    previousHash: immutable.lastHash,
    hash: toHash(basePayload),
    generatedAt,
  };

  return {
    oldValues,
    newValues: {
      ...toJsonObject(newValues),
      __auditIntegrity: integrity as unknown as Prisma.InputJsonObject,
    },
    integrity,
  };
}

export async function recordAuditIntegrityHead(
  db: AuditFullDbClient,
  tenantId: string,
  logId: string,
  integrity: AuditLogIntegrityPayload | null,
): Promise<void> {
  if (!integrity) return;
  await Promise.all([
    db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableLogId } },
      create: { tenantId, key: AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableLogId, value: logId },
      update: { value: logId },
    }),
    db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableHash } },
      create: { tenantId, key: AUDIT_LOG_FULL_SETTING_KEYS.lastImmutableHash, value: integrity.hash },
      update: { value: integrity.hash },
    }),
  ]);
}

export async function getAuditLogFullStatus(db: PrismaClient, tenantId: string): Promise<AuditLogFullStatus> {
  const [policy, retention, siem, immutable] = await Promise.all([
    resolveAuditLogPolicy(db, tenantId),
    getDataRetentionSettings(db, tenantId),
    getSiemSettings(tenantId),
    getAuditImmutableSettings(db, tenantId),
  ]);
  const auditLogRule = retention.rules.find((rule) => rule.module === 'audit_logs') ?? null;

  return {
    generatedAt: new Date().toISOString(),
    auditLevel: policy.level,
    retention: {
      enabled: retention.enabled,
      auditLogRule: auditLogRule
        ? {
            retentionDays: policy.retentionDays,
            action: auditLogRule.action,
            legalArchive: auditLogRule.legalArchive,
            enabled: auditLogRule.enabled,
          }
        : null,
    },
    exportApi: {
      enabled: policy.exportEnabled,
      maxRows: policy.exportMaxRows,
      href: '/api/audit-logs/export',
    },
    siemPush: {
      enabled: policy.siemEnabled && siem.enabled,
      destinationType: siem.destinationType,
      minSeverity: siem.minSeverity,
      lastExportAt: siem.lastExportAt,
      lastStatus: siem.lastStatus,
    },
    immutable,
  };
}
