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
import { TENANT_LOGO_SETTING_KEY, LEGACY_TENANT_LOGO_SETTING_KEY, TENANT_LOGO_SETTING_KEYS, INTERNAL_TENANT_SETTING_KEYS, MAX_LOGO_SIZE, ALLOWED_LOGO_MIME_TYPES, ALLOWED_LOGO_EXTENSIONS, businessRulesService, isJsonObject, readJsonObject, readBoolean, readString, readPositiveNumber, readPositiveInteger, readSiemDestinationType, readSiemSeverity, readBackupFrequency, isDefaultPolicyStorageKey, readDefaultPolicyUpdates, assertEnterpriseTenant, assertAuditLogFullPolicy, isInternalTenantSettingKey, sanitizeFileName, validateLogoFile } from './shared.js';
import type { JsonObject } from './shared.js';

export const complianceSettingsController = {
  async getSiemSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const policy = await assertAuditLogFullPolicy(tenantId, 'SIEM entegrasyonu sadece audit full seviyesi kapsamindadir.');
    if (!canUseAuditLogSiem(policy)) throw new ValidationError('SIEM entegrasyonu sadece audit full seviyesi kapsamindadir.');
    return c.json({ data: await getSiemSettings(tenantId) });
  },
  async updateSiemSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const policy = await assertAuditLogFullPolicy(tenantId, 'SIEM entegrasyonu sadece audit full seviyesi kapsamindadir.');
    if (!canUseAuditLogSiem(policy)) throw new ValidationError('SIEM entegrasyonu sadece audit full seviyesi kapsamindadir.');
    const body = await readJsonObject(c);

    await saveSiemSettings(tenantId, {
      enabled: readBoolean(body.enabled),
      destinationType: readSiemDestinationType(body.destinationType),
      endpointUrl: readString(body.endpointUrl),
      authHeader: readString(body.authHeader),
      minSeverity: readSiemSeverity(body.minSeverity),
      includeDiff: body.includeDiff !== false,
      lastExportAt: null,
      lastStatus: null,
    });

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'audit_logs',
      entityType: EntityType.OTHER,
      entityId: 'siem_settings',
      action: AuditAction.UPDATE,
      newValues: {
        enabled: readBoolean(body.enabled),
        destinationType: readSiemDestinationType(body.destinationType),
        minSeverity: readSiemSeverity(body.minSeverity),
        includeDiff: body.includeDiff !== false,
        endpointConfigured: Boolean(readString(body.endpointUrl)),
        authHeaderConfigured: Boolean(readString(body.authHeader)),
      },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { success: true } });
  },
  async runSiemExportTest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const policy = await assertAuditLogFullPolicy(tenantId, 'SIEM entegrasyonu sadece audit full seviyesi kapsamindadir.');
    if (!canUseAuditLogSiem(policy)) throw new ValidationError('SIEM entegrasyonu sadece audit full seviyesi kapsamindadir.');

    const result = await exportRecentAuditLogsToSiem(tenantId, 25);
    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'audit_logs',
      entityType: EntityType.OTHER,
      entityId: `siem_export:${result.exportedAt}`,
      action: AuditAction.EXPORT,
      newValues: {
        status: result.status,
        destinationType: result.destinationType,
        eventCount: result.eventCount,
        message: result.message,
      },
      ipAddress,
      userAgent,
    });

    return c.json({ data: result });
  },
  async getAuditLogFullStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertAuditLogFullPolicy(tenantId, 'Audit log full sadece audit full seviyesi kapsamindadir.');
    return c.json({ data: await buildAuditLogFullStatus(prisma, tenantId) });
  },
  async updateAuditLogFullSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const policy = await assertAuditLogFullPolicy(tenantId, 'Audit log full sadece audit full seviyesi kapsamindadir.');
    if (!policy.immutableEnabled) throw new ValidationError('Immutable audit log sadece audit full seviyesi kapsamindadir.');
    const body = await readJsonObject(c);
    const immutable = await setAuditImmutableEnabled(prisma, tenantId, readBoolean(body.immutableEnabled));

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'audit_logs',
      entityType: EntityType.OTHER,
      entityId: 'audit_log_full_settings',
      action: AuditAction.UPDATE,
      newValues: {
        immutableEnabled: immutable.enabled,
        lastLogId: immutable.lastLogId,
        hasLastHash: Boolean(immutable.lastHash),
      },
      ipAddress,
      userAgent,
    });

    return c.json({ data: await buildAuditLogFullStatus(prisma, tenantId) });
  },
  async getDataRetentionSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertEnterpriseTenant(tenantId, 'Veri saklama politikasi sadece Enterprise plan kapsamindadir.');
    return c.json({ data: await getDataRetentionSettings(prisma, tenantId) });
  },
  async updateDataRetentionSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    await assertEnterpriseTenant(tenantId, 'Veri saklama politikasi sadece Enterprise plan kapsamindadir.');
    const body = await readJsonObject(c);
    const settings = {
      enabled: readBoolean(body.enabled),
      legalArchiveEnabled: body.legalArchiveEnabled !== false,
      kvkkGdprEnabled: body.kvkkGdprEnabled !== false,
      rules: normalizeRetentionRules(body.rules),
      lastRunAt: null,
      lastSummary: null,
    };

    await saveDataRetentionSettings(prisma, tenantId, settings);

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: DATA_RETENTION_AUDIT_META.module,
      entityType: DATA_RETENTION_AUDIT_META.entityType,
      entityId: DATA_RETENTION_AUDIT_META.settingsEntityId,
      action: DATA_RETENTION_AUDIT_META.updateAction,
      newValues: {
        enabled: settings.enabled,
        legalArchiveEnabled: settings.legalArchiveEnabled,
        kvkkGdprEnabled: settings.kvkkGdprEnabled,
        ruleCount: settings.rules.length,
      },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { success: true } });
  },
  async previewDataRetention(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertEnterpriseTenant(tenantId, 'Veri saklama politikasi sadece Enterprise plan kapsamindadir.');
    return c.json({ data: await buildDataRetentionPreview(prisma, tenantId) });
  },
  async runDataRetentionDryRun(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    await assertEnterpriseTenant(tenantId, 'Veri saklama politikasi sadece Enterprise plan kapsamindadir.');

    const preview = await buildDataRetentionPreview(prisma, tenantId);
    await recordDataRetentionDryRun(prisma, tenantId, preview);

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: DATA_RETENTION_AUDIT_META.module,
      entityType: DATA_RETENTION_AUDIT_META.entityType,
      entityId: DATA_RETENTION_AUDIT_META.dryRunEntityId,
      action: DATA_RETENTION_AUDIT_META.exportAction,
      newValues: dataRetentionAuditValues(preview),
      ipAddress,
      userAgent,
    });

    return c.json({ data: preview });
  },
} as const;
