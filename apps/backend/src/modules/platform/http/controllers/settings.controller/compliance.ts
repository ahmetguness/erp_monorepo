import { AuditAction,EntityType } from '@prisma/client';
import { Context } from 'hono';
import { ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import {
getAuditLogFullStatus as buildAuditLogFullStatus,
setAuditImmutableEnabled
} from '../../../../../services/audit-log-full.service.js';
import {
canUseAuditLogSiem
} from '../../../../../services/audit-log-policy.service.js';
import {
buildDataRetentionPreview,
DATA_RETENTION_AUDIT_META,
dataRetentionAuditValues,
getDataRetentionSettings,
normalizeRetentionRules,
recordDataRetentionDryRun,
saveDataRetentionSettings
} from '../../../../../services/data-retention-policy.service.js';
import {
exportRecentAuditLogsToSiem,
getSiemSettings,
saveSiemSettings
} from '../../../../../services/siem-export.service.js';
import { createAuditLog,getRequestMeta } from '../../../../../utils/audit.js';
import { requireTenantId,requireUserId } from '../../../../../utils/context.js';
import { assertAuditLogFullPolicy,assertEnterpriseTenant,readBoolean,readJsonObject,readSiemDestinationType,readSiemSeverity,readString } from './shared.js';

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
