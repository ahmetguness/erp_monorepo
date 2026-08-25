import { Context } from 'hono';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';
import { prisma } from '../../../../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../../../../errors/index.js';
import { getValidatedBody } from '../../../../../middleware/validateBody.js';
import {
  businessRuleBodySchema,
  moduleSettingBodySchema,
  tenantSettingBodySchema,
} from '../../../../../schemas/request-body.schemas.js';
import { requireTenantId, requireUserId, requireParam } from '../../../../../utils/context.js';
import { createAuditLog, getRequestMeta } from '../../../../../utils/audit.js';
import { AuditAction, EntityType, Plan } from '@prisma/client';
import { bufferToArrayBuffer, storageService } from '../../../../../services/storage.service.js';
import { BusinessRulesService } from '../../../../../services/business-rules.service.js';
import { getTenantSecurityScore } from '../../../../../services/tenant-security.service.js';
import {
  getSecurityHardeningSnapshot,
  listSecuritySessions,
  revokeSecuritySession,
} from '../../../../../services/security-hardening.service.js';
import {
  exportRecentAuditLogsToSiem,
  getSiemSettings,
  SIEM_SETTING_KEYS,
  saveSiemSettings,
  type SiemDestinationType,
  type SiemSeverity,
} from '../../../../../services/siem-export.service.js';
import {
  buildDataRetentionPreview,
  DATA_RETENTION_AUDIT_META,
  DATA_RETENTION_SETTING_KEYS,
  dataRetentionAuditValues,
  getDataRetentionSettings,
  normalizeRetentionRules,
  recordDataRetentionDryRun,
  saveDataRetentionSettings,
} from '../../../../../services/data-retention-policy.service.js';
import {
  buildDeploymentOperationsSnapshot,
  DEPLOYMENT_OPERATIONS_SETTING_KEYS,
  getDeploymentOperationsSettings,
  recordBackupSimulation,
  saveDeploymentOperationsSettings,
  type BackupFrequency,
} from '../../../../../services/deployment-operations.service.js';
import {
  AUDIT_LOG_FULL_SETTING_KEYS,
  getAuditLogFullStatus as buildAuditLogFullStatus,
  setAuditImmutableEnabled,
} from '../../../../../services/audit-log-full.service.js';
import {
  canUseAuditLogSiem,
  resolveAuditLogPolicy,
  type AuditLogPolicy,
} from '../../../../../services/audit-log-policy.service.js';
import {
  BI_CONNECTOR_SETTING_KEYS,
  BI_TOKEN_SETTING_KEY,
  getBiConnectorSettings,
  recordBiScheduleSimulation,
  saveBiConnectorSettings,
} from '../../../../../services/bi-connector.service.js';
import {
  DefaultPolicyEngineService,
  defaultPolicyDefinitions,
  type DefaultPolicyUpdateInput,
} from '../../../../../services/default-policy-engine.service.js';
import { TENANT_LOGO_SETTING_KEY, LEGACY_TENANT_LOGO_SETTING_KEY, TENANT_LOGO_SETTING_KEYS, INTERNAL_TENANT_SETTING_KEYS, MAX_LOGO_SIZE, ALLOWED_LOGO_MIME_TYPES, ALLOWED_LOGO_EXTENSIONS, businessRulesService, isJsonObject, readJsonObject, readBoolean, readString, readPositiveNumber, readPositiveInteger, readSiemDestinationType, readSiemSeverity, readBackupFrequency, isDefaultPolicyStorageKey, readDefaultPolicyUpdates, assertEnterpriseTenant, assertAuditLogFullPolicy, isInternalTenantSettingKey, sanitizeFileName, validateLogoFile } from './shared.js';
import type { JsonObject } from './shared.js';

export const brandingSettingsController = {
  async uploadTenantLogo(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const formData = await c.req.formData();
    const fileValue = formData.get('file');

    if (!(fileValue instanceof File)) {
      return c.json(new ValidationError('file zorunludur.').toJSON(), 400);
    }

    const previous = await prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
    });
    const { extension, mimeType } = validateLogoFile(fileValue);
    const storagePath = `${tenantId}/tenant-logo/${randomUUID()}${extension}`;
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await storageService.put({ key: storagePath, body: buffer, contentType: mimeType });

    const setting = await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
      create: { tenantId, key: TENANT_LOGO_SETTING_KEY, value: storagePath },
      update: { value: storagePath },
    });

    if (previous?.value && previous.value !== storagePath) {
      await storageService.delete(previous.value);
    }
    await prisma.tenantSetting.deleteMany({
      where: { tenantId, key: LEGACY_TENANT_LOGO_SETTING_KEY },
    });

    return c.json({ data: setting });
  },
  async downloadTenantLogo(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const setting = await prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
    });

    if (!setting) return new Response(null, { status: 204 });

    const storedObject = await storageService.get(setting.value);
    if (!storedObject) return new Response(null, { status: 204 });

    return new Response(new Blob([bufferToArrayBuffer(storedObject.body)]), {
      headers: {
        'Content-Type': storedObject.contentType,
        'Content-Length': String(storedObject.contentLength),
        'Cache-Control': 'private, max-age=300',
      },
    });
  },
  async deleteTenantLogo(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const setting = await prisma.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } },
    });

    if (!setting) return c.json(new NotFoundError('Logo').toJSON(), 404);

    await storageService.delete(setting.value);
    await prisma.tenantSetting.delete({ where: { tenantId_key: { tenantId, key: TENANT_LOGO_SETTING_KEY } } });
    await prisma.tenantSetting.deleteMany({
      where: { tenantId, key: LEGACY_TENANT_LOGO_SETTING_KEY },
    });
    return c.json({ data: { success: true } });
  },
} as const;
