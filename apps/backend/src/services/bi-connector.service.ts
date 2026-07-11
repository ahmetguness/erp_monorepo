import type { PrismaClient } from '@prisma/client';

export const BI_CONNECTOR_SETTING_KEYS = {
  scheduleEnabled: 'bi.schedule.enabled',
  scheduleInterval: 'bi.schedule.interval',
  scheduleEntities: 'bi.schedule.entities',
  scheduleLastRun: 'bi.schedule.last_run',
  connectorType: 'bi.connector.type',
  destinationName: 'bi.connector.destination_name',
  readReplicaHost: 'bi.connector.read_replica_host',
  warehouseProject: 'bi.connector.warehouse_project',
  scheduledExportTarget: 'bi.scheduled_export.target',
  scheduledExportFormat: 'bi.scheduled_export.format',
} as const;

export const BI_TOKEN_SETTING_KEY = 'security.bi.token';

export const BI_CONNECTOR_TYPES = ['rest', 'read_replica', 'bigquery', 'snowflake', 'postgresql'] as const;
export const BI_SCHEDULE_INTERVALS = ['daily', 'weekly', 'monthly'] as const;
export const BI_EXPORT_TARGETS = ['none', 'read_replica', 'bigquery', 'snowflake', 'postgresql', 'sftp'] as const;
export const BI_EXPORT_FORMATS = ['json', 'csv', 'parquet'] as const;

export type BiConnectorType = (typeof BI_CONNECTOR_TYPES)[number];
export type BiScheduleInterval = (typeof BI_SCHEDULE_INTERVALS)[number];
export type BiExportTarget = (typeof BI_EXPORT_TARGETS)[number];
export type BiExportFormat = (typeof BI_EXPORT_FORMATS)[number];
export type BiConnectorHealth = 'disabled' | 'needs_token' | 'needs_destination' | 'ready';

export interface BiConnectorStatus {
  health: BiConnectorHealth;
  connectorLabel: string;
  nextRun: string | null;
  configuredConnectors: BiConnectorType[];
  supportedTargets: BiExportTarget[];
}

export interface BiConnectorSettings {
  enabled: boolean;
  interval: BiScheduleInterval;
  entities: string;
  lastRun: string | null;
  token: string;
  connectorType: BiConnectorType;
  destinationName: string;
  readReplicaHost: string;
  warehouseProject: string;
  scheduledExportTarget: BiExportTarget;
  scheduledExportFormat: BiExportFormat;
  status: BiConnectorStatus;
}

export interface BiConnectorSettingsInput {
  enabled: unknown;
  interval: unknown;
  entities: unknown;
  connectorType: unknown;
  destinationName: unknown;
  readReplicaHost: unknown;
  warehouseProject: unknown;
  scheduledExportTarget: unknown;
  scheduledExportFormat: unknown;
}

const CONNECTOR_LABELS: Record<BiConnectorType, string> = {
  rest: 'REST/OData endpoint',
  read_replica: 'Read replica',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  postgresql: 'PostgreSQL',
};

const DEFAULT_ENTITIES = 'products,contacts,invoices';

function pickFromList<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeEntities(value: unknown): string {
  const raw = readString(value, DEFAULT_ENTITIES);
  const entities = raw
    .split(',')
    .map((entity) => entity.trim())
    .filter(Boolean);

  return entities.length > 0 ? Array.from(new Set(entities)).join(',') : DEFAULT_ENTITIES;
}

function calculateNextRun(interval: BiScheduleInterval, lastRun: string | null): string | null {
  if (!lastRun) return null;

  const date = new Date(lastRun);
  if (Number.isNaN(date.getTime())) return null;

  const next = new Date(date);
  if (interval === 'daily') next.setDate(next.getDate() + 1);
  if (interval === 'weekly') next.setDate(next.getDate() + 7);
  if (interval === 'monthly') next.setMonth(next.getMonth() + 1);

  return next.toISOString();
}

function requiresDestination(connectorType: BiConnectorType): boolean {
  return connectorType !== 'rest';
}

function hasDestination(settings: Pick<BiConnectorSettings, 'connectorType' | 'destinationName' | 'readReplicaHost' | 'warehouseProject'>): boolean {
  if (!requiresDestination(settings.connectorType)) return true;
  if (settings.connectorType === 'read_replica' || settings.connectorType === 'postgresql') {
    return settings.readReplicaHost.length > 0;
  }

  return settings.destinationName.length > 0 || settings.warehouseProject.length > 0;
}

function buildStatus(settings: Omit<BiConnectorSettings, 'status'>): BiConnectorStatus {
  let health: BiConnectorHealth = 'ready';
  if (!settings.enabled) health = 'disabled';
  else if (!settings.token) health = 'needs_token';
  else if (!hasDestination(settings)) health = 'needs_destination';

  return {
    health,
    connectorLabel: CONNECTOR_LABELS[settings.connectorType],
    nextRun: settings.enabled ? calculateNextRun(settings.interval, settings.lastRun) : null,
    configuredConnectors: settings.connectorType === 'rest' ? ['rest'] : ['rest', settings.connectorType],
    supportedTargets: [...BI_EXPORT_TARGETS],
  };
}

export async function getBiConnectorSettings(prisma: PrismaClient, tenantId: string): Promise<BiConnectorSettings> {
  const settings = await prisma.tenantSetting.findMany({
    where: {
      tenantId,
      key: { startsWith: 'bi.' },
    },
  });
  const settingsMap = new Map(settings.map((setting) => [setting.key, setting.value]));

  const tokenSetting = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: BI_TOKEN_SETTING_KEY } },
  });

  const base: Omit<BiConnectorSettings, 'status'> = {
    enabled: settingsMap.get(BI_CONNECTOR_SETTING_KEYS.scheduleEnabled) === 'true',
    interval: pickFromList(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.scheduleInterval), BI_SCHEDULE_INTERVALS, 'daily'),
    entities: normalizeEntities(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.scheduleEntities)),
    lastRun: settingsMap.get(BI_CONNECTOR_SETTING_KEYS.scheduleLastRun) || null,
    token: tokenSetting?.value || '',
    connectorType: pickFromList(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.connectorType), BI_CONNECTOR_TYPES, 'rest'),
    destinationName: readString(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.destinationName)),
    readReplicaHost: readString(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.readReplicaHost)),
    warehouseProject: readString(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.warehouseProject)),
    scheduledExportTarget: pickFromList(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.scheduledExportTarget), BI_EXPORT_TARGETS, 'none'),
    scheduledExportFormat: pickFromList(settingsMap.get(BI_CONNECTOR_SETTING_KEYS.scheduledExportFormat), BI_EXPORT_FORMATS, 'json'),
  };

  return {
    ...base,
    status: buildStatus(base),
  };
}

export async function saveBiConnectorSettings(
  prisma: PrismaClient,
  tenantId: string,
  input: BiConnectorSettingsInput
): Promise<BiConnectorSettings> {
  const updates = [
    { key: BI_CONNECTOR_SETTING_KEYS.scheduleEnabled, value: input.enabled === true ? 'true' : 'false' },
    {
      key: BI_CONNECTOR_SETTING_KEYS.scheduleInterval,
      value: pickFromList(input.interval, BI_SCHEDULE_INTERVALS, 'daily'),
    },
    { key: BI_CONNECTOR_SETTING_KEYS.scheduleEntities, value: normalizeEntities(input.entities) },
    {
      key: BI_CONNECTOR_SETTING_KEYS.connectorType,
      value: pickFromList(input.connectorType, BI_CONNECTOR_TYPES, 'rest'),
    },
    { key: BI_CONNECTOR_SETTING_KEYS.destinationName, value: readString(input.destinationName) },
    { key: BI_CONNECTOR_SETTING_KEYS.readReplicaHost, value: readString(input.readReplicaHost) },
    { key: BI_CONNECTOR_SETTING_KEYS.warehouseProject, value: readString(input.warehouseProject) },
    {
      key: BI_CONNECTOR_SETTING_KEYS.scheduledExportTarget,
      value: pickFromList(input.scheduledExportTarget, BI_EXPORT_TARGETS, 'none'),
    },
    {
      key: BI_CONNECTOR_SETTING_KEYS.scheduledExportFormat,
      value: pickFromList(input.scheduledExportFormat, BI_EXPORT_FORMATS, 'json'),
    },
  ];

  await prisma.$transaction(
    updates.map((update) =>
      prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: update.key } },
        create: { tenantId, key: update.key, value: update.value },
        update: { value: update.value },
      })
    )
  );

  return getBiConnectorSettings(prisma, tenantId);
}

export async function recordBiScheduleSimulation(prisma: PrismaClient, tenantId: string): Promise<BiConnectorSettings> {
  const now = new Date().toISOString();

  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: BI_CONNECTOR_SETTING_KEYS.scheduleLastRun } },
    create: { tenantId, key: BI_CONNECTOR_SETTING_KEYS.scheduleLastRun, value: now },
    update: { value: now },
  });

  return getBiConnectorSettings(prisma, tenantId);
}
