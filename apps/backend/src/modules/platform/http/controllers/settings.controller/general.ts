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

export const generalSettingsController = {
  async defaultPolicySnapshot(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const snapshot = await new DefaultPolicyEngineService(prisma).snapshot(tenantId);
    return c.json({ data: snapshot });
  },
  async updateDefaultPolicies(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await readJsonObject(c);
    const updates = readDefaultPolicyUpdates(body);
    const snapshot = await new DefaultPolicyEngineService(prisma).updateMany(tenantId, updates);

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'settings',
      entityType: EntityType.OTHER,
      entityId: 'default_policy_engine',
      action: AuditAction.UPDATE,
      newValues: { updatedKeys: updates.map((update) => update.storageKey) },
      ...getRequestMeta(c),
    });

    return c.json({ data: snapshot });
  },

  // ── Tenant Settings ──────────────────────────
  async listTenantSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const settings = await prisma.tenantSetting.findMany({
      where: {
        tenantId,
        key: { notIn: [...INTERNAL_TENANT_SETTING_KEYS] },
      },
      orderBy: { key: 'asc' },
    });
    return c.json({ data: settings });
  },
  async upsertTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody(c, tenantSettingBodySchema);
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
    }
    if (isInternalTenantSettingKey(body.key)) {
      return c.json(new ValidationError('Bu ayar sistem tarafindan yonetilir.').toJSON(), 400);
    }

    const setting = await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: body.key } },
      create: { tenantId, key: body.key, value: body.value },
      update: { value: body.value },
    });

    return c.json({ data: setting });
  },
  async deleteTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const key = c.req.param('key');
    if (isInternalTenantSettingKey(key)) {
      return c.json(new ValidationError('Bu ayar sistem tarafindan yonetilir.').toJSON(), 400);
    }

    await prisma.tenantSetting.deleteMany({ where: { tenantId, key } });
    return c.json({ data: { success: true } });
  },
  async listBusinessRules(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rules = await businessRulesService.list(tenantId);
    return c.json({ data: rules });
  },
  async upsertBusinessRule(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = getValidatedBody(c, businessRuleBodySchema);
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
    }

    const rule = await businessRulesService.upsert(tenantId, body.key, body.value);
    return c.json({ data: rule });
  },

  // ── Module Settings ──────────────────────────
  async listModuleSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const module = c.req.query('module');
    const settings = await prisma.moduleSetting.findMany({
      where: { tenantId, ...(module && { module }) },
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
    return c.json({ data: settings });
  },
  async upsertModuleSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody(c, moduleSettingBodySchema);
    if (!body.module || !body.key || body.value === undefined) {
      return c.json(new ValidationError('module, key ve value zorunludur.').toJSON(), 400);
    }

    const setting = await prisma.moduleSetting.upsert({
      where: { tenantId_module_key: { tenantId, module: body.module, key: body.key } },
      create: { tenantId, module: body.module, key: body.key, value: body.value },
      update: { value: body.value },
    });

    return c.json({ data: setting });
  },
} as const;
