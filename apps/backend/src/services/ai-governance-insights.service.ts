import type { AiRequestType, Prisma, PrismaClient } from '@prisma/client';
import { AI_GOVERNANCE_INSIGHT_KEYS, AI_POLICY_MODULE } from './ai/governance-settings.js';
import { getAiRedactionRegistry } from './ai/redaction-registry.js';

export interface AiGovernanceCostSettings {
  monthlyCostLimitUsd: number | null;
  alertThresholdPercent: number;
  blockOnLimit: boolean;
}

export interface AiGovernanceCostSettingsInput {
  monthlyCostLimitUsd: number | null;
  alertThresholdPercent: number;
  blockOnLimit: boolean;
}

export interface AiModelUsage {
  model: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AiMaskingReportItem {
  fieldKey: string;
  label: string;
  scope: 'all' | 'public';
  occurrences: number;
  affectedRequests: number;
  lastSeenAt: Date | null;
  topRequestTypes: Array<{
    requestType: AiRequestType;
    count: number;
  }>;
}

export interface AiGovernanceCostSummary {
  periodStart: Date;
  periodEnd: Date;
  totalRequests: number;
  totalTokens: number;
  estimatedCostUsd: number;
  monthlyCostLimitUsd: number | null;
  alertThresholdPercent: number;
  blockOnLimit: boolean;
  usagePercent: number | null;
  status: 'NO_LIMIT' | 'OK' | 'NEAR_LIMIT' | 'OVER_LIMIT';
  remainingUsd: number | null;
}

export interface AiGovernanceInsights {
  costSettings: AiGovernanceCostSettings;
  costSummary: AiGovernanceCostSummary;
  modelUsage: AiModelUsage[];
  maskingReport: AiMaskingReportItem[];
}

export interface AiGovernanceCostGuard {
  allowed: boolean;
  reason: string | null;
  estimatedCostUsd: number;
  monthlyCostLimitUsd: number | null;
}

const DEFAULT_COST_SETTINGS: AiGovernanceCostSettings = {
  monthlyCostLimitUsd: null,
  alertThresholdPercent: 80,
  blockOnLimit: false,
};

const MODEL_COST_PER_1K_TOKENS_USD: Readonly<Record<string, number>> = {
  'gpt-4o-mini': 0.0003,
  'gpt-4o': 0.005,
  'gpt-4.1-mini': 0.0004,
  'gpt-4.1': 0.006,
  system: 0,
};

function readPositiveNumber(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readThreshold(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COST_SETTINGS.alertThresholdPercent;
  return Math.min(Math.max(Math.round(parsed), 1), 100);
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function costForModel(model: string, totalTokens: number): number {
  const unitCost = MODEL_COST_PER_1K_TOKENS_USD[model] ?? MODEL_COST_PER_1K_TOKENS_USD['gpt-4o-mini'];
  return roundUsd((totalTokens / 1000) * unitCost);
}

function clampCostSettings(input: AiGovernanceCostSettingsInput): AiGovernanceCostSettings {
  const monthlyCostLimitUsd =
    input.monthlyCostLimitUsd === null
      ? null
      : Math.min(Math.max(Number(input.monthlyCostLimitUsd.toFixed(2)), 0.01), 1_000_000);

  return {
    monthlyCostLimitUsd,
    alertThresholdPercent: Math.min(Math.max(Math.round(input.alertThresholdPercent), 1), 100),
    blockOnLimit: input.blockOnLimit,
  };
}

function costStatus(usagePercent: number | null, threshold: number): AiGovernanceCostSummary['status'] {
  if (usagePercent === null) return 'NO_LIMIT';
  if (usagePercent >= 100) return 'OVER_LIMIT';
  if (usagePercent >= threshold) return 'NEAR_LIMIT';
  return 'OK';
}

function requestTypeBreakdown(rows: Array<{ requestType: AiRequestType }>): AiMaskingReportItem['topRequestTypes'] {
  const counts = new Map<AiRequestType, number>();
  for (const row of rows) {
    counts.set(row.requestType, (counts.get(row.requestType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([requestType, count]) => ({ requestType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export async function getAiGovernanceCostSettings(db: PrismaClient, tenantId: string): Promise<AiGovernanceCostSettings> {
  const settings = await db.moduleSetting.findMany({
    where: {
      tenantId,
      module: AI_POLICY_MODULE,
      key: { in: Object.values(AI_GOVERNANCE_INSIGHT_KEYS) },
    },
    select: { key: true, value: true },
  });
  const settingByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    monthlyCostLimitUsd: readPositiveNumber(
      settingByKey.get(AI_GOVERNANCE_INSIGHT_KEYS.monthlyCostLimitUsd),
      DEFAULT_COST_SETTINGS.monthlyCostLimitUsd,
    ),
    alertThresholdPercent: readThreshold(settingByKey.get(AI_GOVERNANCE_INSIGHT_KEYS.alertThresholdPercent)),
    blockOnLimit: readBoolean(
      settingByKey.get(AI_GOVERNANCE_INSIGHT_KEYS.blockOnLimit),
      DEFAULT_COST_SETTINGS.blockOnLimit,
    ),
  };
}

export async function updateAiGovernanceCostSettings(
  db: PrismaClient,
  tenantId: string,
  input: AiGovernanceCostSettingsInput,
): Promise<AiGovernanceCostSettings> {
  const settings = clampCostSettings(input);
  const monthlyCostLimitValue = settings.monthlyCostLimitUsd === null ? '' : String(settings.monthlyCostLimitUsd);

  await db.$transaction([
    db.moduleSetting.upsert({
      where: {
        tenantId_module_key: {
          tenantId,
          module: AI_POLICY_MODULE,
          key: AI_GOVERNANCE_INSIGHT_KEYS.monthlyCostLimitUsd,
        },
      },
      create: {
        tenantId,
        module: AI_POLICY_MODULE,
        key: AI_GOVERNANCE_INSIGHT_KEYS.monthlyCostLimitUsd,
        value: monthlyCostLimitValue,
      },
      update: { value: monthlyCostLimitValue },
    }),
    db.moduleSetting.upsert({
      where: {
        tenantId_module_key: {
          tenantId,
          module: AI_POLICY_MODULE,
          key: AI_GOVERNANCE_INSIGHT_KEYS.alertThresholdPercent,
        },
      },
      create: {
        tenantId,
        module: AI_POLICY_MODULE,
        key: AI_GOVERNANCE_INSIGHT_KEYS.alertThresholdPercent,
        value: String(settings.alertThresholdPercent),
      },
      update: { value: String(settings.alertThresholdPercent) },
    }),
    db.moduleSetting.upsert({
      where: {
        tenantId_module_key: {
          tenantId,
          module: AI_POLICY_MODULE,
          key: AI_GOVERNANCE_INSIGHT_KEYS.blockOnLimit,
        },
      },
      create: {
        tenantId,
        module: AI_POLICY_MODULE,
        key: AI_GOVERNANCE_INSIGHT_KEYS.blockOnLimit,
        value: String(settings.blockOnLimit),
      },
      update: { value: String(settings.blockOnLimit) },
    }),
  ]);

  return settings;
}

export async function getAiGovernanceInsights(db: PrismaClient, tenantId: string, now = new Date()): Promise<AiGovernanceInsights> {
  const periodStart = monthStart(now);
  const where: Prisma.AiRequestLogWhereInput = {
    tenantId,
    createdAt: { gte: periodStart, lte: now },
  };

  const [costSettings, modelGroups, maskingRows, totalRequests] = await Promise.all([
    getAiGovernanceCostSettings(db, tenantId),
    db.aiRequestLog.groupBy({
      by: ['model'],
      where,
      _count: { _all: true },
      _sum: {
        tokenPrompt: true,
        tokenCompletion: true,
        tokenTotal: true,
      },
      orderBy: { model: 'asc' },
    }),
    db.aiRequestLog.findMany({
      where: {
        ...where,
        redactedFields: { isEmpty: false },
      },
      select: {
        requestType: true,
        redactedFields: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.aiRequestLog.count({ where }),
  ]);

  const modelUsage = modelGroups.map((group): AiModelUsage => {
    const totalTokens = group._sum.tokenTotal ?? ((group._sum.tokenPrompt ?? 0) + (group._sum.tokenCompletion ?? 0));
    return {
      model: group.model,
      requestCount: group._count._all,
      promptTokens: group._sum.tokenPrompt ?? 0,
      completionTokens: group._sum.tokenCompletion ?? 0,
      totalTokens,
      estimatedCostUsd: costForModel(group.model, totalTokens),
    };
  });

  const totalTokens = modelUsage.reduce((sum, usage) => sum + usage.totalTokens, 0);
  const estimatedCostUsd = roundUsd(modelUsage.reduce((sum, usage) => sum + usage.estimatedCostUsd, 0));
  const usagePercent = costSettings.monthlyCostLimitUsd
    ? Number(((estimatedCostUsd / costSettings.monthlyCostLimitUsd) * 100).toFixed(2))
    : null;
  const remainingUsd = costSettings.monthlyCostLimitUsd === null
    ? null
    : roundUsd(Math.max(costSettings.monthlyCostLimitUsd - estimatedCostUsd, 0));

  const registryByKey = new Map(getAiRedactionRegistry().rules.map((rule) => [rule.key, rule]));
  const rowsByField = new Map<string, Array<{ requestType: AiRequestType; createdAt: Date }>>();

  for (const row of maskingRows) {
    for (const fieldKey of row.redactedFields) {
      const rows = rowsByField.get(fieldKey) ?? [];
      rows.push({ requestType: row.requestType, createdAt: row.createdAt });
      rowsByField.set(fieldKey, rows);
    }
  }

  const maskingReport = [...rowsByField.entries()]
    .map(([fieldKey, rows]): AiMaskingReportItem => {
      const registry = registryByKey.get(fieldKey);
      return {
        fieldKey,
        label: registry?.label ?? fieldKey,
        scope: registry?.scope ?? 'all',
        occurrences: rows.length,
        affectedRequests: rows.length,
        lastSeenAt: rows[0]?.createdAt ?? null,
        topRequestTypes: requestTypeBreakdown(rows),
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);

  return {
    costSettings,
    costSummary: {
      periodStart,
      periodEnd: now,
      totalRequests,
      totalTokens,
      estimatedCostUsd,
      monthlyCostLimitUsd: costSettings.monthlyCostLimitUsd,
      alertThresholdPercent: costSettings.alertThresholdPercent,
      blockOnLimit: costSettings.blockOnLimit,
      usagePercent,
      status: costStatus(usagePercent, costSettings.alertThresholdPercent),
      remainingUsd,
    },
    modelUsage,
    maskingReport,
  };
}

export async function checkAiGovernanceCostLimit(db: PrismaClient, tenantId: string, now = new Date()): Promise<AiGovernanceCostGuard> {
  const settings = await getAiGovernanceCostSettings(db, tenantId);
  if (!settings.blockOnLimit || settings.monthlyCostLimitUsd === null) {
    return {
      allowed: true,
      reason: null,
      estimatedCostUsd: 0,
      monthlyCostLimitUsd: settings.monthlyCostLimitUsd,
    };
  }

  const periodStart = monthStart(now);
  const modelGroups = await db.aiRequestLog.groupBy({
    by: ['model'],
    where: {
      tenantId,
      createdAt: { gte: periodStart, lte: now },
    },
    _sum: {
      tokenPrompt: true,
      tokenCompletion: true,
      tokenTotal: true,
    },
  });

  const estimatedCostUsd = roundUsd(modelGroups.reduce((sum, group) => {
    const totalTokens = group._sum.tokenTotal ?? ((group._sum.tokenPrompt ?? 0) + (group._sum.tokenCompletion ?? 0));
    return sum + costForModel(group.model, totalTokens);
  }, 0));
  const allowed = estimatedCostUsd < settings.monthlyCostLimitUsd;

  return {
    allowed,
    reason: allowed ? null : `AI aylik maliyet limiti asildi (${formatUsdForReason(estimatedCostUsd)} / ${formatUsdForReason(settings.monthlyCostLimitUsd)}).`,
    estimatedCostUsd,
    monthlyCostLimitUsd: settings.monthlyCostLimitUsd,
  };
}

function formatUsdForReason(value: number): string {
  return `$${value.toFixed(2)}`;
}
