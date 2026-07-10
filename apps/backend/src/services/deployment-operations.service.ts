import { readdir } from 'fs/promises';
import { join } from 'path';
import { DeploymentType, Plan, PrismaClient } from '@prisma/client';
import { getStorageStatus } from './storage.service.js';

export const DEPLOYMENT_OPERATIONS_SETTING_KEYS = {
  environmentName: 'deployment.operations.environment_name',
  releaseChannel: 'deployment.operations.release_channel',
  backupEnabled: 'deployment.operations.backup.enabled',
  backupFrequency: 'deployment.operations.backup.frequency',
  backupRetentionDays: 'deployment.operations.backup.retention_days',
  backupLastRunAt: 'deployment.operations.backup.last_run_at',
  backupLastStatus: 'deployment.operations.backup.last_status',
  maintenanceWindow: 'deployment.operations.maintenance_window',
} as const;

export type DeploymentEnvironmentStatus = 'ok' | 'warn' | 'fail';
export type BackupFrequency = 'hourly' | 'daily' | 'weekly';

export interface DeploymentOperationsSettings {
  environmentName: string;
  releaseChannel: string;
  backupEnabled: boolean;
  backupFrequency: BackupFrequency;
  backupRetentionDays: number;
  backupLastRunAt: string | null;
  backupLastStatus: string | null;
  maintenanceWindow: string;
}

export interface DeploymentHealthCheck {
  key: string;
  label: string;
  status: DeploymentEnvironmentStatus;
  message: string;
}

export interface DeploymentMigrationStatus {
  totalMigrations: number;
  appliedMigrations: number | null;
  pendingMigrations: string[];
  latestMigration: string | null;
  checkedAt: string;
}

export interface DeploymentOperationsSnapshot {
  tenant: {
    id: string;
    companyName: string;
    plan: Plan;
    deploymentType: DeploymentType;
  };
  environment: {
    name: string;
    nodeEnv: string;
    appRole: string;
    releaseChannel: string;
    version: string;
    maintenanceWindow: string;
  };
  backup: {
    enabled: boolean;
    frequency: BackupFrequency;
    retentionDays: number;
    lastRunAt: string | null;
    lastStatus: string | null;
  };
  health: {
    status: DeploymentEnvironmentStatus;
    checks: DeploymentHealthCheck[];
  };
  migrations: DeploymentMigrationStatus;
  generatedAt: string;
}

type DeploymentDbClient = Pick<PrismaClient, 'tenant' | 'tenantSetting' | '$queryRaw'>;

interface AppliedMigrationRow {
  migration_name: string;
}

const DEFAULT_SETTINGS: DeploymentOperationsSettings = {
  environmentName: 'production',
  releaseChannel: 'stable',
  backupEnabled: true,
  backupFrequency: 'daily',
  backupRetentionDays: 30,
  backupLastRunAt: null,
  backupLastStatus: null,
  maintenanceWindow: 'Sunday 02:00-04:00',
};

const VALID_BACKUP_FREQUENCIES = new Set<BackupFrequency>(['hourly', 'daily', 'weekly']);

function readSetting(map: Map<string, string>, key: string): string {
  return map.get(key) ?? '';
}

function readPositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBackupFrequency(value: string): BackupFrequency {
  return VALID_BACKUP_FREQUENCIES.has(value as BackupFrequency) ? value as BackupFrequency : DEFAULT_SETTINGS.backupFrequency;
}

function appVersion(): string {
  return process.env.APP_VERSION ?? process.env.RELEASE_VERSION ?? process.env.npm_package_version ?? 'dev';
}

async function databaseCheck(db: DeploymentDbClient): Promise<DeploymentHealthCheck> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { key: 'database', label: 'Database', status: 'ok', message: 'Database bağlantısı çalışıyor.' };
  } catch {
    return { key: 'database', label: 'Database', status: 'fail', message: 'Database health check başarısız.' };
  }
}

function storageCheck(): DeploymentHealthCheck {
  const storage = getStorageStatus();
  if (storage.driver === 'r2') {
    return {
      key: 'storage',
      label: 'Object storage',
      status: storage.ready ? 'ok' : 'fail',
      message: storage.ready ? 'R2 storage hazır.' : `R2 storage eksik: ${storage.missing.join(', ') || 'unknown'}`,
    };
  }
  return {
    key: 'storage',
    label: 'Object storage',
    status: storage.productionLocalAllowed ? 'warn' : 'ok',
    message: storage.productionLocalAllowed ? 'Production local storage kullanıyor.' : `Storage driver: ${storage.driver}`,
  };
}

function backupCheck(settings: DeploymentOperationsSettings): DeploymentHealthCheck {
  if (!settings.backupEnabled) {
    return { key: 'backup', label: 'Backup', status: 'warn', message: 'Yedekleme politikası kapalı.' };
  }
  return {
    key: 'backup',
    label: 'Backup',
    status: settings.backupLastStatus?.startsWith('failed') ? 'fail' : 'ok',
    message: settings.backupLastRunAt
      ? `Son yedek: ${settings.backupLastRunAt} (${settings.backupLastStatus ?? 'status yok'})`
      : `${settings.backupFrequency} yedek politikası tanımlı; son koşum bekleniyor.`,
  };
}

async function migrationDirectories(): Promise<string[]> {
  const candidates = [
    join(process.cwd(), 'prisma', 'migrations'),
    join(process.cwd(), 'apps', 'backend', 'prisma', 'migrations'),
  ];

  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch {
      continue;
    }
  }

  return [];
}

async function appliedMigrations(db: DeploymentDbClient): Promise<string[] | null> {
  try {
    const rows = await db.$queryRaw<AppliedMigrationRow[]>`
      SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name ASC
    `;
    return rows.map((row) => row.migration_name);
  } catch {
    return null;
  }
}

async function migrationStatus(db: DeploymentDbClient): Promise<DeploymentMigrationStatus> {
  const [localMigrations, applied] = await Promise.all([migrationDirectories(), appliedMigrations(db)]);
  const appliedSet = new Set(applied ?? []);
  return {
    totalMigrations: localMigrations.length,
    appliedMigrations: applied?.length ?? null,
    pendingMigrations: applied ? localMigrations.filter((migration) => !appliedSet.has(migration)) : [],
    latestMigration: localMigrations.at(-1) ?? null,
    checkedAt: new Date().toISOString(),
  };
}

function aggregateStatus(checks: readonly DeploymentHealthCheck[]): DeploymentEnvironmentStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'ok';
}

export async function getDeploymentOperationsSettings(db: DeploymentDbClient, tenantId: string): Promise<DeploymentOperationsSettings> {
  const settings = await db.tenantSetting.findMany({
    where: { tenantId, key: { in: Object.values(DEPLOYMENT_OPERATIONS_SETTING_KEYS) } },
    select: { key: true, value: true },
  });
  const map = new Map(settings.map((setting) => [setting.key, setting.value]));
  return {
    environmentName: readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.environmentName) || DEFAULT_SETTINGS.environmentName,
    releaseChannel: readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.releaseChannel) || DEFAULT_SETTINGS.releaseChannel,
    backupEnabled: readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupEnabled) !== 'false',
    backupFrequency: readBackupFrequency(readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupFrequency)),
    backupRetentionDays: readPositiveInteger(readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupRetentionDays), DEFAULT_SETTINGS.backupRetentionDays),
    backupLastRunAt: readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupLastRunAt) || null,
    backupLastStatus: readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupLastStatus) || null,
    maintenanceWindow: readSetting(map, DEPLOYMENT_OPERATIONS_SETTING_KEYS.maintenanceWindow) || DEFAULT_SETTINGS.maintenanceWindow,
  };
}

export async function saveDeploymentOperationsSettings(db: DeploymentDbClient, tenantId: string, settings: DeploymentOperationsSettings): Promise<void> {
  const updates = [
    { key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.environmentName, value: settings.environmentName },
    { key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.releaseChannel, value: settings.releaseChannel },
    { key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupEnabled, value: settings.backupEnabled ? 'true' : 'false' },
    { key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupFrequency, value: settings.backupFrequency },
    { key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupRetentionDays, value: String(settings.backupRetentionDays) },
    { key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.maintenanceWindow, value: settings.maintenanceWindow },
  ];

  await Promise.all(updates.map((update) => db.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: update.key } },
    create: { tenantId, key: update.key, value: update.value },
    update: { value: update.value },
  })));
}

export async function recordBackupSimulation(db: DeploymentDbClient, tenantId: string): Promise<{ lastRunAt: string; lastStatus: string }> {
  const lastRunAt = new Date().toISOString();
  const lastStatus = 'success: simulated backup';
  await Promise.all([
    db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupLastRunAt } },
      create: { tenantId, key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupLastRunAt, value: lastRunAt },
      update: { value: lastRunAt },
    }),
    db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupLastStatus } },
      create: { tenantId, key: DEPLOYMENT_OPERATIONS_SETTING_KEYS.backupLastStatus, value: lastStatus },
      update: { value: lastStatus },
    }),
  ]);
  return { lastRunAt, lastStatus };
}

export async function buildDeploymentOperationsSnapshot(db: DeploymentDbClient, tenantId: string): Promise<DeploymentOperationsSnapshot | null> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, companyName: true, plan: true, deploymentType: true },
  });
  if (!tenant) return null;

  const [settings, migrations, dbCheck] = await Promise.all([
    getDeploymentOperationsSettings(db, tenantId),
    migrationStatus(db),
    databaseCheck(db),
  ]);
  const checks = [
    dbCheck,
    storageCheck(),
    backupCheck(settings),
    {
      key: 'migrations',
      label: 'Migrations',
      status: migrations.appliedMigrations === null || migrations.pendingMigrations.length > 0 ? 'warn' : 'ok',
      message: migrations.appliedMigrations === null
        ? 'Migration tablosu okunamadı.'
        : migrations.pendingMigrations.length > 0
          ? `${migrations.pendingMigrations.length} migration bekliyor.`
          : 'Migration durumu güncel.',
    } satisfies DeploymentHealthCheck,
  ];

  return {
    tenant,
    environment: {
      name: settings.environmentName,
      nodeEnv: process.env.NODE_ENV ?? 'development',
      appRole: process.env.APP_ROLE ?? 'api',
      releaseChannel: settings.releaseChannel,
      version: appVersion(),
      maintenanceWindow: settings.maintenanceWindow,
    },
    backup: {
      enabled: settings.backupEnabled,
      frequency: settings.backupFrequency,
      retentionDays: settings.backupRetentionDays,
      lastRunAt: settings.backupLastRunAt,
      lastStatus: settings.backupLastStatus,
    },
    health: { status: aggregateStatus(checks), checks },
    migrations,
    generatedAt: new Date().toISOString(),
  };
}
