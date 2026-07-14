import { FeatureKey, Plan } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { TenantFeatureService } from './tenant-feature.service.js';

export type AuditLogLevel = 'basic' | 'standard' | 'full';

export interface AuditLogPolicy {
  level: AuditLogLevel;
  retentionDays: number | null;
  retentionLabel: string;
  exportEnabled: boolean;
  exportMaxRows: number;
  siemEnabled: boolean;
  immutableEnabled: boolean;
}

const AUDIT_LOG_EXPORT_MAX_ROWS = 10_000;
const BASIC_RETENTION_DAYS = 30;
const STANDARD_RETENTION_DAYS = 365;

export const AUDIT_LOG_POLICY_BY_LEVEL: Record<AuditLogLevel, AuditLogPolicy> = {
  basic: {
    level: 'basic',
    retentionDays: BASIC_RETENTION_DAYS,
    retentionLabel: '30 days',
    exportEnabled: false,
    exportMaxRows: 0,
    siemEnabled: false,
    immutableEnabled: false,
  },
  standard: {
    level: 'standard',
    retentionDays: STANDARD_RETENTION_DAYS,
    retentionLabel: '1 year',
    exportEnabled: true,
    exportMaxRows: AUDIT_LOG_EXPORT_MAX_ROWS,
    siemEnabled: false,
    immutableEnabled: false,
  },
  full: {
    level: 'full',
    retentionDays: null,
    retentionLabel: 'unlimited',
    exportEnabled: true,
    exportMaxRows: AUDIT_LOG_EXPORT_MAX_ROWS,
    siemEnabled: true,
    immutableEnabled: true,
  },
};

function normalizeAuditLogLevel(value: string | null | undefined): AuditLogLevel {
  if (value === 'standard' || value === 'full') return value;
  return 'basic';
}

function levelForPlan(plan: Plan): AuditLogLevel {
  if (plan === Plan.ENTERPRISE) return 'full';
  if (plan === Plan.PROFESSIONAL) return 'standard';
  return 'basic';
}

function minimumLevel(left: AuditLogLevel, right: AuditLogLevel): AuditLogLevel {
  const rank: Record<AuditLogLevel, number> = { basic: 1, standard: 2, full: 3 };
  return rank[left] <= rank[right] ? left : right;
}

export function getAuditLogCutoffDate(policy: AuditLogPolicy, now = new Date()): Date | null {
  if (policy.retentionDays === null) return null;
  const date = new Date(now);
  date.setDate(date.getDate() - policy.retentionDays);
  return date;
}

export async function resolveAuditLogPolicy(db: PrismaClient, tenantId: string): Promise<AuditLogPolicy> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
  const planLevel = levelForPlan(tenant?.plan ?? Plan.STARTER);
  const feature = await new TenantFeatureService(db).resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
  const resolvedLevel = normalizeAuditLogLevel(feature.value);
  const level = minimumLevel(planLevel, resolvedLevel);
  return AUDIT_LOG_POLICY_BY_LEVEL[level];
}

export function canUseAuditLogSiem(policy: AuditLogPolicy): boolean {
  return policy.siemEnabled && policy.level === 'full';
}

export function canUseAuditLogExport(policy: AuditLogPolicy): boolean {
  return policy.exportEnabled;
}
