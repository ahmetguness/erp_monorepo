import { Context } from 'hono';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';
import { prisma } from '../../../lib/prisma';
import { NotFoundError, ValidationError } from '../../../errors';
import { getValidatedBody } from '../../../middleware/validateBody';
import {
  businessRuleBodySchema,
  moduleSettingBodySchema,
  tenantSettingBodySchema,
} from '../../../schemas/request-body.schemas';
import { requireTenantId, requireUserId, requireParam } from '../../../utils/context.js';
import { createAuditLog, getRequestMeta } from '../../../utils/audit.js';
import { AuditAction, EntityType, Plan } from '@prisma/client';
import { bufferToArrayBuffer, storageService } from '../../storage.service.js';
import { BusinessRulesService } from '../../business-rules.service.js';
import { getTenantSecurityScore } from '../../tenant-security.service.js';
import {
  getSecurityHardeningSnapshot,
  listSecuritySessions,
  revokeSecuritySession,
} from '../../security-hardening.service.js';
import {
  exportRecentAuditLogsToSiem,
  getSiemSettings,
  SIEM_SETTING_KEYS,
  saveSiemSettings,
  type SiemDestinationType,
  type SiemSeverity,
} from '../../siem-export.service.js';
import {
  buildDataRetentionPreview,
  DATA_RETENTION_AUDIT_META,
  DATA_RETENTION_SETTING_KEYS,
  dataRetentionAuditValues,
  getDataRetentionSettings,
  normalizeRetentionRules,
  recordDataRetentionDryRun,
  saveDataRetentionSettings,
} from '../../data-retention-policy.service.js';
import {
  buildDeploymentOperationsSnapshot,
  DEPLOYMENT_OPERATIONS_SETTING_KEYS,
  getDeploymentOperationsSettings,
  recordBackupSimulation,
  saveDeploymentOperationsSettings,
  type BackupFrequency,
} from '../../deployment-operations.service.js';
import {
  AUDIT_LOG_FULL_SETTING_KEYS,
  getAuditLogFullStatus as buildAuditLogFullStatus,
  setAuditImmutableEnabled,
} from '../../audit-log-full.service.js';
import {
  canUseAuditLogSiem,
  resolveAuditLogPolicy,
  type AuditLogPolicy,
} from '../../audit-log-policy.service.js';
import {
  BI_CONNECTOR_SETTING_KEYS,
  BI_TOKEN_SETTING_KEY,
  getBiConnectorSettings,
  recordBiScheduleSimulation,
  saveBiConnectorSettings,
} from '../../bi-connector.service.js';
import {
  DefaultPolicyEngineService,
  defaultPolicyDefinitions,
  type DefaultPolicyUpdateInput,
} from '../../default-policy-engine.service.js';

export const TENANT_LOGO_SETTING_KEY = 'tenant_logo_storage_path';
export const LEGACY_TENANT_LOGO_SETTING_KEY = 'company_logo';
export const TENANT_LOGO_SETTING_KEYS = [TENANT_LOGO_SETTING_KEY, LEGACY_TENANT_LOGO_SETTING_KEY] as const;
export const INTERNAL_TENANT_SETTING_KEYS = [
  ...TENANT_LOGO_SETTING_KEYS,
  'security.sessions',
  ...Object.values(SIEM_SETTING_KEYS),
  ...Object.values(DATA_RETENTION_SETTING_KEYS),
  ...Object.values(AUDIT_LOG_FULL_SETTING_KEYS),
  ...Object.values(DEPLOYMENT_OPERATIONS_SETTING_KEYS),
  ...Object.values(BI_CONNECTOR_SETTING_KEYS),
  BI_TOKEN_SETTING_KEY,
  ...defaultPolicyDefinitions().map((definition) => definition.storageKey),
] as const;
export const MAX_LOGO_SIZE = 2 * 1024 * 1024;
export const ALLOWED_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const ALLOWED_LOGO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const businessRulesService = new BusinessRulesService(prisma);

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonObject(c: Context): Promise<JsonObject> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ValidationError('Gecersiz JSON govdesi.');
  }

  if (!isJsonObject(value)) {
    throw new ValidationError('JSON govdesi nesne olmalidir.');
  }

  return value;
}

export function readBoolean(value: unknown): boolean {
  return value === true;
}

export function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readPositiveInteger(value: unknown, fallback: number): number {
  const numberValue = readPositiveNumber(value, fallback);
  return Number.isInteger(numberValue) ? numberValue : Math.trunc(numberValue);
}

export function readSiemDestinationType(value: unknown): SiemDestinationType {
  return value === 'webhook' || value === 'syslog' || value === 'generic' ? value : 'webhook';
}

export function readSiemSeverity(value: unknown): SiemSeverity {
  return value === 'info' || value === 'warning' || value === 'critical' ? value : 'warning';
}

export function readBackupFrequency(value: unknown): BackupFrequency {
  return value === 'hourly' || value === 'daily' || value === 'weekly' ? value : 'daily';
}

export function isDefaultPolicyStorageKey(value: unknown): value is string {
  return typeof value === 'string' && defaultPolicyDefinitions().some((definition) => definition.storageKey === value);
}

export function readDefaultPolicyUpdates(body: JsonObject): DefaultPolicyUpdateInput[] {
  const updates = body.updates;
  if (!Array.isArray(updates)) {
    throw new ValidationError('updates dizisi zorunludur.');
  }
  return updates.map((item) => {
    if (!isJsonObject(item) || !isDefaultPolicyStorageKey(item.storageKey) || typeof item.value !== 'string') {
      throw new ValidationError('Her policy guncellemesi storageKey ve string value icermelidir.');
    }
    return { storageKey: item.storageKey, value: item.value };
  });
}

export async function assertEnterpriseTenant(tenantId: string, message: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });

  if (tenant?.plan !== Plan.ENTERPRISE) {
    throw new ValidationError(message);
  }
}

export async function assertAuditLogFullPolicy(tenantId: string, message: string): Promise<AuditLogPolicy> {
  const policy = await resolveAuditLogPolicy(prisma, tenantId);
  if (policy.level !== 'full') {
    throw new ValidationError(message);
  }
  return policy;
}

export function isInternalTenantSettingKey(key: string | undefined): boolean {
  return typeof key === 'string' && INTERNAL_TENANT_SETTING_KEYS.some((internalKey) => internalKey === key);
}

export function sanitizeFileName(fileName: string): string {
  return basename(fileName).replace(/[^\w.\- ]/g, '_').slice(0, 180) || 'logo';
}

export function validateLogoFile(file: File): { extension: string; mimeType: string } {
  const safeName = sanitizeFileName(file.name);
  const extension = extname(safeName).toLowerCase();
  const mimeType = file.type || 'application/octet-stream';

  if (file.size <= 0) throw new ValidationError('Boş logo yüklenemez.');
  if (file.size > MAX_LOGO_SIZE) throw new ValidationError('Logo boyutu 2MB sınırını aşamaz.');
  if (!ALLOWED_LOGO_EXTENSIONS.has(extension) || !ALLOWED_LOGO_MIME_TYPES.has(mimeType)) {
    throw new ValidationError('Logo için JPG, PNG veya WebP dosyası yükleyin.');
  }

  return { extension, mimeType };
}

// ─────────────────────────────────────────────
// Settings Controller
// TenantSetting + ModuleSetting CRUD
// ─────────────────────────────────────────────
