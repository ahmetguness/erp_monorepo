import { AuditAction, EntityType, PrismaClient } from '@prisma/client';

export const DATA_RETENTION_SETTING_KEYS = {
  enabled: 'compliance.retention.enabled',
  legalArchiveEnabled: 'compliance.retention.legal_archive.enabled',
  kvkkGdprEnabled: 'compliance.retention.kvkk_gdpr.enabled',
  rules: 'compliance.retention.rules',
  lastRunAt: 'compliance.retention.last_run_at',
  lastSummary: 'compliance.retention.last_summary',
} as const;

export type RetentionModuleKey =
  | 'audit_logs'
  | 'contacts'
  | 'invoices'
  | 'accounting'
  | 'inventory'
  | 'hr'
  | 'mail'
  | 'notifications'
  | 'marketplace';

export type RetentionAction = 'review' | 'archive' | 'anonymize' | 'legal_hold';

export interface RetentionPolicyRule {
  module: RetentionModuleKey;
  retentionDays: number;
  action: RetentionAction;
  legalArchive: boolean;
  anonymizeFields: string[];
  gdprBasis: string;
  enabled: boolean;
}

export interface DataRetentionSettings {
  enabled: boolean;
  legalArchiveEnabled: boolean;
  kvkkGdprEnabled: boolean;
  rules: RetentionPolicyRule[];
  lastRunAt: string | null;
  lastSummary: string | null;
}

export interface DataRetentionPreviewItem {
  module: RetentionModuleKey;
  cutoffDate: string;
  candidateCount: number;
  action: RetentionAction;
  legalArchive: boolean;
  anonymizeFields: string[];
  gdprBasis: string;
  enabled: boolean;
}

export interface DataRetentionPreview {
  generatedAt: string;
  enabled: boolean;
  legalArchiveEnabled: boolean;
  kvkkGdprEnabled: boolean;
  totalCandidates: number;
  items: DataRetentionPreviewItem[];
}

type TenantSettingClient = Pick<PrismaClient['tenantSetting'], 'findMany' | 'upsert'>;
type CountClient = Pick<
  PrismaClient,
  'auditLog' | 'contact' | 'invoice' | 'journalEntry' | 'product' | 'employee' | 'mailMessage' | 'notification' | 'marketplaceOrder'
>;
type RetentionDbClient = { tenantSetting: TenantSettingClient } & CountClient;

const DEFAULT_RULES: readonly RetentionPolicyRule[] = [
  { module: 'audit_logs', retentionDays: 2555, action: 'legal_hold', legalArchive: true, anonymizeFields: ['ipAddress', 'userAgent'], gdprBasis: 'legal_obligation', enabled: true },
  { module: 'contacts', retentionDays: 1825, action: 'anonymize', legalArchive: true, anonymizeFields: ['taxNumber', 'email', 'phone', 'address'], gdprBasis: 'legitimate_interest', enabled: true },
  { module: 'invoices', retentionDays: 3650, action: 'legal_hold', legalArchive: true, anonymizeFields: [], gdprBasis: 'legal_obligation', enabled: true },
  { module: 'accounting', retentionDays: 3650, action: 'legal_hold', legalArchive: true, anonymizeFields: [], gdprBasis: 'legal_obligation', enabled: true },
  { module: 'inventory', retentionDays: 1825, action: 'archive', legalArchive: false, anonymizeFields: [], gdprBasis: 'legitimate_interest', enabled: true },
  { module: 'hr', retentionDays: 3650, action: 'anonymize', legalArchive: true, anonymizeFields: ['email', 'phone', 'salary'], gdprBasis: 'legal_obligation', enabled: true },
  { module: 'mail', retentionDays: 1095, action: 'archive', legalArchive: false, anonymizeFields: ['to', 'cc', 'bcc'], gdprBasis: 'consent', enabled: true },
  { module: 'notifications', retentionDays: 365, action: 'archive', legalArchive: false, anonymizeFields: ['message'], gdprBasis: 'legitimate_interest', enabled: true },
  { module: 'marketplace', retentionDays: 1825, action: 'anonymize', legalArchive: true, anonymizeFields: ['customerEmail', 'customerPhone', 'shippingAddress'], gdprBasis: 'contract', enabled: true },
];

const VALID_MODULES = new Set<RetentionModuleKey>(DEFAULT_RULES.map((rule) => rule.module));
const VALID_ACTIONS = new Set<RetentionAction>(['review', 'archive', 'anonymize', 'legal_hold']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function parseJson(value: string | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseRules(value: string | undefined): RetentionPolicyRule[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [...DEFAULT_RULES];
  const fallbackByModule = new Map(DEFAULT_RULES.map((rule) => [rule.module, rule]));
  const rules = parsed
    .filter(isRecord)
    .map((item): RetentionPolicyRule | null => {
      const moduleValue = readString(item.module);
      if (!VALID_MODULES.has(moduleValue as RetentionModuleKey)) return null;
      const module = moduleValue as RetentionModuleKey;
      const fallback = fallbackByModule.get(module) ?? DEFAULT_RULES[0];
      const actionValue = readString(item.action);
      return {
        module,
        retentionDays: readPositiveInteger(item.retentionDays, fallback.retentionDays),
        action: VALID_ACTIONS.has(actionValue as RetentionAction) ? actionValue as RetentionAction : fallback.action,
        legalArchive: readBoolean(item.legalArchive, fallback.legalArchive),
        anonymizeFields: readStringArray(item.anonymizeFields),
        gdprBasis: readString(item.gdprBasis, fallback.gdprBasis),
        enabled: readBoolean(item.enabled, fallback.enabled),
      };
    })
    .filter((rule): rule is RetentionPolicyRule => rule !== null);

  const existingModules = new Set(rules.map((rule) => rule.module));
  const missingDefaults = DEFAULT_RULES.filter((rule) => !existingModules.has(rule.module));
  return [...rules, ...missingDefaults];
}

function stringifyRules(rules: readonly RetentionPolicyRule[]): string {
  return JSON.stringify(rules);
}

export function normalizeRetentionRules(value: unknown): RetentionPolicyRule[] {
  if (typeof value === 'string') return parseRules(value);
  if (Array.isArray(value)) return parseRules(JSON.stringify(value));
  return [...DEFAULT_RULES];
}

function cutoffDate(retentionDays: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - retentionDays);
  return date;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported retention module: ${String(value)}`);
}

async function countCandidates(db: CountClient, tenantId: string, rule: RetentionPolicyRule, before: Date): Promise<number> {
  switch (rule.module) {
    case 'audit_logs':
      return db.auditLog.count({ where: { tenantId, createdAt: { lt: before } } });
    case 'contacts':
      return db.contact.count({ where: { tenantId, createdAt: { lt: before }, deletedAt: null } });
    case 'invoices':
      return db.invoice.count({ where: { tenantId, date: { lt: before }, deletedAt: null } });
    case 'accounting':
      return db.journalEntry.count({ where: { tenantId, date: { lt: before } } });
    case 'inventory':
      return db.product.count({ where: { tenantId, createdAt: { lt: before }, deletedAt: null } });
    case 'hr':
      return db.employee.count({ where: { tenantId, createdAt: { lt: before }, deletedAt: null } });
    case 'mail':
      return db.mailMessage.count({ where: { tenantId, createdAt: { lt: before } } });
    case 'notifications':
      return db.notification.count({ where: { tenantId, createdAt: { lt: before } } });
    case 'marketplace':
      return db.marketplaceOrder.count({ where: { tenantId, orderDate: { lt: before } } });
    default:
      return assertNever(rule.module);
  }
}

export async function getDataRetentionSettings(db: RetentionDbClient, tenantId: string): Promise<DataRetentionSettings> {
  const settings = await db.tenantSetting.findMany({
    where: { tenantId, key: { in: Object.values(DATA_RETENTION_SETTING_KEYS) } },
    select: { key: true, value: true },
  });
  const map = new Map(settings.map((setting) => [setting.key, setting.value]));
  return {
    enabled: map.get(DATA_RETENTION_SETTING_KEYS.enabled) === 'true',
    legalArchiveEnabled: map.get(DATA_RETENTION_SETTING_KEYS.legalArchiveEnabled) !== 'false',
    kvkkGdprEnabled: map.get(DATA_RETENTION_SETTING_KEYS.kvkkGdprEnabled) !== 'false',
    rules: parseRules(map.get(DATA_RETENTION_SETTING_KEYS.rules)),
    lastRunAt: map.get(DATA_RETENTION_SETTING_KEYS.lastRunAt) ?? null,
    lastSummary: map.get(DATA_RETENTION_SETTING_KEYS.lastSummary) ?? null,
  };
}

export async function saveDataRetentionSettings(db: RetentionDbClient, tenantId: string, settings: DataRetentionSettings): Promise<void> {
  const updates = [
    { key: DATA_RETENTION_SETTING_KEYS.enabled, value: settings.enabled ? 'true' : 'false' },
    { key: DATA_RETENTION_SETTING_KEYS.legalArchiveEnabled, value: settings.legalArchiveEnabled ? 'true' : 'false' },
    { key: DATA_RETENTION_SETTING_KEYS.kvkkGdprEnabled, value: settings.kvkkGdprEnabled ? 'true' : 'false' },
    { key: DATA_RETENTION_SETTING_KEYS.rules, value: stringifyRules(settings.rules) },
  ];

  await Promise.all(updates.map((update) => db.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: update.key } },
    create: { tenantId, key: update.key, value: update.value },
    update: { value: update.value },
  })));
}

export async function buildDataRetentionPreview(db: RetentionDbClient, tenantId: string): Promise<DataRetentionPreview> {
  const settings = await getDataRetentionSettings(db, tenantId);
  const items = await Promise.all(settings.rules.map(async (rule): Promise<DataRetentionPreviewItem> => {
    const before = cutoffDate(rule.retentionDays);
    const candidateCount = rule.enabled ? await countCandidates(db, tenantId, rule, before) : 0;
    return {
      module: rule.module,
      cutoffDate: before.toISOString(),
      candidateCount,
      action: rule.action,
      legalArchive: settings.legalArchiveEnabled && rule.legalArchive,
      anonymizeFields: settings.kvkkGdprEnabled ? rule.anonymizeFields : [],
      gdprBasis: rule.gdprBasis,
      enabled: rule.enabled,
    };
  }));

  return {
    generatedAt: new Date().toISOString(),
    enabled: settings.enabled,
    legalArchiveEnabled: settings.legalArchiveEnabled,
    kvkkGdprEnabled: settings.kvkkGdprEnabled,
    totalCandidates: items.reduce((total, item) => total + item.candidateCount, 0),
    items,
  };
}

export async function recordDataRetentionDryRun(db: RetentionDbClient, tenantId: string, preview: DataRetentionPreview): Promise<void> {
  const summary = JSON.stringify({ totalCandidates: preview.totalCandidates, moduleCount: preview.items.length });
  await Promise.all([
    db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: DATA_RETENTION_SETTING_KEYS.lastRunAt } },
      create: { tenantId, key: DATA_RETENTION_SETTING_KEYS.lastRunAt, value: preview.generatedAt },
      update: { value: preview.generatedAt },
    }),
    db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: DATA_RETENTION_SETTING_KEYS.lastSummary } },
      create: {
        tenantId,
        key: DATA_RETENTION_SETTING_KEYS.lastSummary,
        value: summary,
      },
      update: { value: summary },
    }),
  ]);
}

export function dataRetentionAuditValues(preview: DataRetentionPreview): {
  totalCandidates: number;
  modules: Array<{ module: RetentionModuleKey; candidateCount: number; action: RetentionAction }>;
} {
  return {
    totalCandidates: preview.totalCandidates,
    modules: preview.items.map((item) => ({
      module: item.module,
      candidateCount: item.candidateCount,
      action: item.action,
    })),
  };
}

export const DATA_RETENTION_AUDIT_META = {
  module: 'compliance',
  entityType: EntityType.OTHER,
  settingsEntityId: 'data_retention_policy',
  dryRunEntityId: 'data_retention_dry_run',
  updateAction: AuditAction.UPDATE,
  exportAction: AuditAction.EXPORT,
} as const;
