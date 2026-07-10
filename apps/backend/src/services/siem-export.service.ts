import { AuditAction, EntityType, Plan, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { resolveAuditStandardFlags } from './audit/audit-standard.js';

export const SIEM_SETTING_KEYS = {
  enabled: 'security.siem.enabled',
  destinationType: 'security.siem.destination_type',
  endpointUrl: 'security.siem.endpoint_url',
  authHeader: 'security.siem.auth_header',
  minSeverity: 'security.siem.min_severity',
  includeDiff: 'security.siem.include_diff',
  lastExportAt: 'security.siem.last_export_at',
  lastStatus: 'security.siem.last_status',
} as const;

export type SiemDestinationType = 'webhook' | 'syslog' | 'generic';
export type SiemSeverity = 'info' | 'warning' | 'critical';

export interface SiemSettings {
  enabled: boolean;
  destinationType: SiemDestinationType;
  endpointUrl: string;
  authHeader: string;
  minSeverity: SiemSeverity;
  includeDiff: boolean;
  lastExportAt: string | null;
  lastStatus: string | null;
}

export interface SiemAuditEvent {
  eventId: string;
  tenantId: string;
  occurredAt: string;
  severity: SiemSeverity;
  module: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  oldValues?: Prisma.JsonValue | null;
  newValues?: Prisma.JsonValue | null;
}

export interface SiemExportResult {
  status: 'skipped' | 'delivered' | 'prepared' | 'failed';
  destinationType: SiemDestinationType;
  eventCount: number;
  exportedAt: string;
  message: string;
  sample: string;
}

type AuditLogLike = {
  id: string;
  tenantId: string;
  module: string;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  userId: string | null;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

const DEFAULT_SIEM_SETTINGS: SiemSettings = {
  enabled: false,
  destinationType: 'webhook',
  endpointUrl: '',
  authHeader: '',
  minSeverity: 'warning',
  includeDiff: true,
  lastExportAt: null,
  lastStatus: null,
};

const SEVERITY_RANK: Record<SiemSeverity, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

function isSiemDestinationType(value: string): value is SiemDestinationType {
  return value === 'webhook' || value === 'syslog' || value === 'generic';
}

function isSiemSeverity(value: string): value is SiemSeverity {
  return value === 'info' || value === 'warning' || value === 'critical';
}

function readSetting(map: Map<string, string>, key: string): string {
  return map.get(key) ?? '';
}

export async function getSiemSettings(tenantId: string): Promise<SiemSettings> {
  const settings = await prisma.tenantSetting.findMany({
    where: { tenantId, key: { startsWith: 'security.siem.' } },
    select: { key: true, value: true },
  });
  const map = new Map(settings.map((setting) => [setting.key, setting.value]));
  const destinationType = readSetting(map, SIEM_SETTING_KEYS.destinationType);
  const minSeverity = readSetting(map, SIEM_SETTING_KEYS.minSeverity);

  return {
    enabled: readSetting(map, SIEM_SETTING_KEYS.enabled) === 'true',
    destinationType: isSiemDestinationType(destinationType) ? destinationType : DEFAULT_SIEM_SETTINGS.destinationType,
    endpointUrl: readSetting(map, SIEM_SETTING_KEYS.endpointUrl),
    authHeader: readSetting(map, SIEM_SETTING_KEYS.authHeader),
    minSeverity: isSiemSeverity(minSeverity) ? minSeverity : DEFAULT_SIEM_SETTINGS.minSeverity,
    includeDiff: readSetting(map, SIEM_SETTING_KEYS.includeDiff) !== 'false',
    lastExportAt: readSetting(map, SIEM_SETTING_KEYS.lastExportAt) || null,
    lastStatus: readSetting(map, SIEM_SETTING_KEYS.lastStatus) || null,
  };
}

export async function saveSiemSettings(tenantId: string, settings: SiemSettings): Promise<void> {
  const updates = [
    { key: SIEM_SETTING_KEYS.enabled, value: settings.enabled ? 'true' : 'false' },
    { key: SIEM_SETTING_KEYS.destinationType, value: settings.destinationType },
    { key: SIEM_SETTING_KEYS.endpointUrl, value: settings.endpointUrl },
    { key: SIEM_SETTING_KEYS.authHeader, value: settings.authHeader },
    { key: SIEM_SETTING_KEYS.minSeverity, value: settings.minSeverity },
    { key: SIEM_SETTING_KEYS.includeDiff, value: settings.includeDiff ? 'true' : 'false' },
  ];

  await prisma.$transaction(
    updates.map((update) => prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: update.key } },
      create: { tenantId, key: update.key, value: update.value },
      update: { value: update.value },
    })),
  );
}

function resolveSeverity(log: Pick<AuditLogLike, 'action' | 'module' | 'entityType' | 'oldValues' | 'newValues'>): SiemSeverity {
  const flags = resolveAuditStandardFlags(log);
  if (flags.isCritical) return 'critical';
  if (log.action === AuditAction.UPDATE || log.action === AuditAction.EXPORT) return 'warning';
  return 'info';
}

function shouldExport(severity: SiemSeverity, minSeverity: SiemSeverity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minSeverity];
}

export function toSiemAuditEvent(log: AuditLogLike, includeDiff: boolean): SiemAuditEvent {
  return {
    eventId: log.id,
    tenantId: log.tenantId,
    occurredAt: log.createdAt.toISOString(),
    severity: resolveSeverity(log),
    module: log.module,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    userId: log.userId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    ...(includeDiff && { oldValues: log.oldValues, newValues: log.newValues }),
  };
}

export function toSyslogLine(event: SiemAuditEvent): string {
  const timestamp = new Date(event.occurredAt).toISOString();
  const severityCode = event.severity === 'critical' ? 2 : event.severity === 'warning' ? 4 : 6;
  const structured = [
    `eventId="${event.eventId}"`,
    `tenantId="${event.tenantId}"`,
    `module="${event.module}"`,
    `action="${event.action}"`,
    `entityType="${event.entityType}"`,
    `entityId="${event.entityId}"`,
  ].join(' ');
  return `<${severityCode}>1 ${timestamp} axon-erp audit - - [axonAudit ${structured}] ${event.severity} audit event`;
}

function buildPayload(settings: SiemSettings, events: SiemAuditEvent[]): string {
  if (settings.destinationType === 'syslog') {
    return events.map(toSyslogLine).join('\n');
  }
  return JSON.stringify({ source: 'axon-erp', exportedAt: new Date().toISOString(), events }, null, 2);
}

function authHeaders(authHeader: string): Record<string, string> {
  if (!authHeader.trim()) return {};
  const separatorIndex = authHeader.indexOf(':');
  if (separatorIndex <= 0) return { Authorization: authHeader.trim() };
  return { [authHeader.slice(0, separatorIndex).trim()]: authHeader.slice(separatorIndex + 1).trim() };
}

async function updateLastStatus(tenantId: string, status: string, exportedAt: string): Promise<void> {
  await prisma.$transaction([
    prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: SIEM_SETTING_KEYS.lastExportAt } },
      create: { tenantId, key: SIEM_SETTING_KEYS.lastExportAt, value: exportedAt },
      update: { value: exportedAt },
    }),
    prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: SIEM_SETTING_KEYS.lastStatus } },
      create: { tenantId, key: SIEM_SETTING_KEYS.lastStatus, value: status },
      update: { value: status },
    }),
  ]);
}

export async function exportRecentAuditLogsToSiem(tenantId: string, limit = 25): Promise<SiemExportResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
  if (tenant?.plan !== Plan.ENTERPRISE) {
    return {
      status: 'skipped',
      destinationType: 'webhook',
      eventCount: 0,
      exportedAt: new Date().toISOString(),
      message: 'SIEM export sadece Enterprise plan icindir.',
      sample: '',
    };
  }

  const settings = await getSiemSettings(tenantId);
  const logs = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(limit, 100)),
  });
  const events = logs
    .map((log) => toSiemAuditEvent(log, settings.includeDiff))
    .filter((event) => shouldExport(event.severity, settings.minSeverity));
  const payload = buildPayload(settings, events);
  const exportedAt = new Date().toISOString();

  if (!settings.enabled) {
    return {
      status: 'prepared',
      destinationType: settings.destinationType,
      eventCount: events.length,
      exportedAt,
      message: 'SIEM kapali; payload hazirlandi.',
      sample: payload.slice(0, 2000),
    };
  }

  if (!settings.endpointUrl) {
    await updateLastStatus(tenantId, 'failed: endpoint missing', exportedAt);
    return {
      status: 'failed',
      destinationType: settings.destinationType,
      eventCount: events.length,
      exportedAt,
      message: 'SIEM endpoint URL zorunludur.',
      sample: payload.slice(0, 2000),
    };
  }

  try {
    const response = await fetch(settings.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': settings.destinationType === 'syslog' ? 'text/plain' : 'application/json',
        ...authHeaders(settings.authHeader),
      },
      body: payload,
    });
    const status = response.ok ? `delivered: ${response.status}` : `failed: ${response.status}`;
    await updateLastStatus(tenantId, status, exportedAt);
    return {
      status: response.ok ? 'delivered' : 'failed',
      destinationType: settings.destinationType,
      eventCount: events.length,
      exportedAt,
      message: status,
      sample: payload.slice(0, 2000),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen SIEM gonderim hatasi';
    await updateLastStatus(tenantId, `failed: ${message}`, exportedAt);
    return {
      status: 'failed',
      destinationType: settings.destinationType,
      eventCount: events.length,
      exportedAt,
      message,
      sample: payload.slice(0, 2000),
    };
  }
}

export async function pushSingleAuditLogToSiem(log: AuditLogLike): Promise<void> {
  const settings = await getSiemSettings(log.tenantId);
  if (!settings.enabled || !settings.endpointUrl) return;
  const tenant = await prisma.tenant.findUnique({ where: { id: log.tenantId }, select: { plan: true } });
  if (tenant?.plan !== Plan.ENTERPRISE) return;
  const event = toSiemAuditEvent(log, settings.includeDiff);
  if (!shouldExport(event.severity, settings.minSeverity)) return;
  const payload = buildPayload(settings, [event]);
  const response = await fetch(settings.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': settings.destinationType === 'syslog' ? 'text/plain' : 'application/json',
      ...authHeaders(settings.authHeader),
    },
    body: payload,
  });
  await updateLastStatus(log.tenantId, response.ok ? `delivered: ${response.status}` : `failed: ${response.status}`, new Date().toISOString());
}
