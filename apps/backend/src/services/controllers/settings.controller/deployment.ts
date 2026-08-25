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

export const deploymentSettingsController = {
  async getDeploymentOperationsSnapshot(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertEnterpriseTenant(tenantId, 'On-premise/private cloud operasyon paneli sadece Enterprise plan kapsamindadir.');
    const snapshot = await buildDeploymentOperationsSnapshot(prisma, tenantId);
    if (!snapshot) return c.json(new NotFoundError('Tenant', tenantId).toJSON(), 404);
    return c.json({ data: snapshot });
  },
  async getDeploymentOperationsSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertEnterpriseTenant(tenantId, 'On-premise/private cloud operasyon paneli sadece Enterprise plan kapsamindadir.');
    return c.json({ data: await getDeploymentOperationsSettings(prisma, tenantId) });
  },
  async updateDeploymentOperationsSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    await assertEnterpriseTenant(tenantId, 'On-premise/private cloud operasyon paneli sadece Enterprise plan kapsamindadir.');
    const body = await readJsonObject(c);
    const settings = {
      environmentName: readString(body.environmentName, 'production'),
      releaseChannel: readString(body.releaseChannel, 'stable'),
      backupEnabled: body.backupEnabled !== false,
      backupFrequency: readBackupFrequency(body.backupFrequency),
      backupRetentionDays: readPositiveInteger(body.backupRetentionDays, 30),
      backupLastRunAt: null,
      backupLastStatus: null,
      maintenanceWindow: readString(body.maintenanceWindow, 'Sunday 02:00-04:00'),
    };

    await saveDeploymentOperationsSettings(prisma, tenantId, settings);
    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'deployment_operations',
      entityType: EntityType.OTHER,
      entityId: 'deployment_operations_settings',
      action: AuditAction.UPDATE,
      newValues: {
        environmentName: settings.environmentName,
        releaseChannel: settings.releaseChannel,
        backupEnabled: settings.backupEnabled,
        backupFrequency: settings.backupFrequency,
        backupRetentionDays: settings.backupRetentionDays,
        maintenanceWindow: settings.maintenanceWindow,
      },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { success: true } });
  },
  async simulateDeploymentBackup(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    await assertEnterpriseTenant(tenantId, 'On-premise/private cloud operasyon paneli sadece Enterprise plan kapsamindadir.');

    const result = await recordBackupSimulation(prisma, tenantId);
    const snapshot = await buildDeploymentOperationsSnapshot(prisma, tenantId);
    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'deployment_operations',
      entityType: EntityType.OTHER,
      entityId: 'deployment_backup_simulation',
      action: AuditAction.UPDATE,
      newValues: result,
      ipAddress,
      userAgent,
    });

    return c.json({ data: { ...result, snapshot } });
  },
  async getBiSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertEnterpriseTenant(tenantId, 'BI ayarlari sadece Enterprise plan musterileri icindir.');

    return c.json({
      data: await getBiConnectorSettings(prisma, tenantId),
    });
  },
  async updateBiSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertEnterpriseTenant(tenantId, 'BI ayarlari sadece Enterprise plan musterileri icindir.');
    const body = await readJsonObject(c);
    await saveBiConnectorSettings(prisma, tenantId, {
      enabled: body.enabled,
      interval: body.interval,
      entities: body.entities,
      connectorType: body.connectorType,
      destinationName: body.destinationName,
      readReplicaHost: body.readReplicaHost,
      warehouseProject: body.warehouseProject,
      scheduledExportTarget: body.scheduledExportTarget,
      scheduledExportFormat: body.scheduledExportFormat,
    });

    return c.json({ data: { success: true } });
  },
  async generateBiToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    await assertEnterpriseTenant(tenantId, 'BI ayarlari sadece Enterprise plan musterileri icindir.');

    const token = 'bi_' + randomUUID().replace(/-/g, '');

    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: BI_TOKEN_SETTING_KEY } },
      create: { tenantId, key: BI_TOKEN_SETTING_KEY, value: token },
      update: { value: token },
    });

    return c.json({ data: { token } });
  },
  async runBiScheduleSimulation(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    await assertEnterpriseTenant(tenantId, 'BI ayarlari sadece Enterprise plan musterileri icindir.');
    const settings = await recordBiScheduleSimulation(prisma, tenantId);

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'data_warehouse',
      entityType: EntityType.OTHER,
      entityId: 'bi_export_schedule',
      action: AuditAction.UPDATE,
      newValues: {
        status: 'success',
        executedAt: settings.lastRun,
        connectorType: settings.connectorType,
        scheduledExportTarget: settings.scheduledExportTarget,
        scheduledExportFormat: settings.scheduledExportFormat,
      },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { success: true, lastRun: settings.lastRun, status: settings.status } });
  },
  async getPortalToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const contactId = requireParam(c, 'contactId');

    await assertEnterpriseTenant(tenantId, 'Musteri portali sadece Enterprise plani kapsamindadir.');

    // Verify contact belongs to tenant
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      throw new NotFoundError('Cari', contactId);
    }

    const setting = await prisma.tenantSetting.findFirst({
      where: { tenantId, key: `portal.token.${contactId}` },
      select: { value: true },
    });

    return c.json({ data: { token: setting?.value ?? null } });
  },
  async generatePortalToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const contactId = requireParam(c, 'contactId');

    await assertEnterpriseTenant(tenantId, 'Musteri portali sadece Enterprise plani kapsamindadir.');

    // Verify contact belongs to tenant
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      throw new NotFoundError('Cari', contactId);
    }

    const token = 'cpt_' + randomUUID().replace(/-/g, '');

    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: `portal.token.${contactId}` } },
      create: { tenantId, key: `portal.token.${contactId}`, value: token },
      update: { value: token },
    });

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'contacts',
      entityType: EntityType.CONTACT,
      entityId: contactId,
      action: AuditAction.UPDATE,
      newValues: { portalTokenGenerated: true },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { token } });
  },
} as const;
