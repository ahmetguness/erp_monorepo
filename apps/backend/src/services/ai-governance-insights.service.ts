import type { AiRequestType, Prisma, PrismaClient } from '@prisma/client';
import { AI_GOVERNANCE_INSIGHT_KEYS, AI_POLICY_MODULE } from './ai/governance-settings.js';
import { getAiGovernancePolicy, type AiGovernancePolicy } from './ai/policy.service.js';
import { getAiRedactionRegistry } from './ai/redaction-registry.js';
import { getSecurityHardeningSnapshot, type SecurityHardeningSnapshot } from './security-hardening.service.js';

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

export type EnterpriseControlCenterTone = 'healthy' | 'watch' | 'risk';

export interface EnterpriseControlCenterMetric {
  key: 'ai_policy' | 'cost_guard' | 'security' | 'observability';
  label: string;
  tone: EnterpriseControlCenterTone;
  value: number | string;
  detail: string;
}

export interface EnterpriseControlCenterAction {
  key: string;
  label: string;
  detail: string;
  href: string;
  severity: EnterpriseControlCenterTone;
}

export interface EnterpriseControlCenterSnapshot {
  generatedAt: Date;
  readinessScore: number;
  posture: EnterpriseControlCenterTone;
  metrics: EnterpriseControlCenterMetric[];
  actions: EnterpriseControlCenterAction[];
  security: {
    activeSessionCount: number;
    weakPermissionRiskCount: number;
    apiKeyRotationRiskCount: number;
    webhookIssueCount: number;
    publicEndpointAbuseCount: number;
  };
  observability: {
    failedAiRequestCount: number;
    fallbackAiRequestCount: number;
    deniedPermissionCount: number;
    partialPermissionCount: number;
    redactedFieldEventCount: number;
    recentFailureAt: Date | null;
  };
}

export interface AiGovernanceInsights {
  costSettings: AiGovernanceCostSettings;
  costSummary: AiGovernanceCostSummary;
  modelUsage: AiModelUsage[];
  maskingReport: AiMaskingReportItem[];
  enterpriseControlCenter: EnterpriseControlCenterSnapshot;
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

function controlToneFromRiskCount(count: number): EnterpriseControlCenterTone {
  if (count >= 5) return 'risk';
  if (count > 0) return 'watch';
  return 'healthy';
}

function readinessPosture(score: number): EnterpriseControlCenterTone {
  if (score >= 85) return 'healthy';
  if (score >= 65) return 'watch';
  return 'risk';
}

function scorePenalty(tone: EnterpriseControlCenterTone): number {
  if (tone === 'risk') return 20;
  if (tone === 'watch') return 10;
  return 0;
}

function buildEnterpriseControlCenter(input: {
  generatedAt: Date;
  policy: AiGovernancePolicy;
  costSummary: AiGovernanceCostSummary;
  securitySnapshot: SecurityHardeningSnapshot;
  failedAiRequestCount: number;
  fallbackAiRequestCount: number;
  deniedPermissionCount: number;
  partialPermissionCount: number;
  redactedFieldEventCount: number;
  recentFailureAt: Date | null;
}): EnterpriseControlCenterSnapshot {
  const webhookIssueCount =
    input.securitySnapshot.webhookAudit.missingSecretCount +
    input.securitySnapshot.webhookAudit.failedWebhookCount +
    input.securitySnapshot.webhookAudit.replayableWebhookCount +
    input.securitySnapshot.webhookAudit.duplicateWindowCount;
  const securityRiskCount =
    input.securitySnapshot.weakPermissionRisks.length +
    input.securitySnapshot.apiKeyRotation.length +
    webhookIssueCount +
    input.securitySnapshot.publicEndpointAbuse.length;
  const observabilityRiskCount =
    input.failedAiRequestCount +
    input.fallbackAiRequestCount +
    input.deniedPermissionCount +
    input.partialPermissionCount;

  const policyTone: EnterpriseControlCenterTone = input.policy.enabled ? 'healthy' : 'risk';
  const costTone: EnterpriseControlCenterTone =
    input.costSummary.status === 'OVER_LIMIT'
      ? 'risk'
      : input.costSummary.status === 'NEAR_LIMIT' || input.costSummary.status === 'NO_LIMIT'
        ? 'watch'
        : 'healthy';
  const securityTone = controlToneFromRiskCount(securityRiskCount);
  const observabilityTone = controlToneFromRiskCount(observabilityRiskCount);
  const readinessScore = Math.max(
    0,
    100 - [policyTone, costTone, securityTone, observabilityTone].reduce((sum, tone) => sum + scorePenalty(tone), 0),
  );

  const actions: EnterpriseControlCenterAction[] = [
    ...(!input.policy.enabled
      ? [{
          key: 'enable-ai-policy',
          label: 'AI politikasini etkinlestir',
          detail: 'Kurumsal kontrol merkezi icin tenant AI politikasi aktif olmali.',
          href: '/dashboard/settings/ai-governance',
          severity: 'risk' as const,
        }]
      : []),
    ...(input.costSummary.status === 'NO_LIMIT'
      ? [{
          key: 'set-cost-limit',
          label: 'Maliyet limiti belirle',
          detail: 'Enterprise AI kullaniminda aylik limit ve uyarilar tanimli olmali.',
          href: '/dashboard/settings/ai-governance',
          severity: 'watch' as const,
        }]
      : []),
    ...(input.securitySnapshot.weakPermissionRisks.length > 0
      ? [{
          key: 'review-risky-roles',
          label: 'Riskli rolleri gozden gecir',
          detail: `${input.securitySnapshot.weakPermissionRisks.length} rolde hassas izin kombinasyonu var.`,
          href: '/dashboard/settings',
          severity: securityTone,
        }]
      : []),
    ...(input.deniedPermissionCount > 0
      ? [{
          key: 'review-ai-denials',
          label: 'AI izin retlerini incele',
          detail: `${input.deniedPermissionCount} AI istegi izin kontrolunde reddedildi.`,
          href: '/dashboard/settings/ai-governance',
          severity: 'watch' as const,
        }]
      : []),
  ].slice(0, 6);

  return {
    generatedAt: input.generatedAt,
    readinessScore,
    posture: readinessPosture(readinessScore),
    metrics: [
      {
        key: 'ai_policy',
        label: 'AI politika',
        tone: policyTone,
        value: input.policy.enabled ? 'Acik' : 'Kapali',
        detail: input.policy.logPrompts ? 'Prompt ozeti kaydediliyor.' : 'Prompt ozeti kapali.',
      },
      {
        key: 'cost_guard',
        label: 'Maliyet guardrail',
        tone: costTone,
        value: input.costSummary.usagePercent === null ? 'Limit yok' : `%${input.costSummary.usagePercent.toFixed(1)}`,
        detail: `Aylik tahmini maliyet ${formatUsdForReason(input.costSummary.estimatedCostUsd)}.`,
      },
      {
        key: 'security',
        label: 'Admin security',
        tone: securityTone,
        value: securityRiskCount,
        detail: `${input.securitySnapshot.sessions.active} aktif oturum, ${input.securitySnapshot.weakPermissionRisks.length} rol riski.`,
      },
      {
        key: 'observability',
        label: 'AI observability',
        tone: observabilityTone,
        value: observabilityRiskCount,
        detail: `${input.failedAiRequestCount} hata, ${input.deniedPermissionCount} izin reddi.`,
      },
    ],
    actions,
    security: {
      activeSessionCount: input.securitySnapshot.sessions.active,
      weakPermissionRiskCount: input.securitySnapshot.weakPermissionRisks.length,
      apiKeyRotationRiskCount: input.securitySnapshot.apiKeyRotation.length,
      webhookIssueCount,
      publicEndpointAbuseCount: input.securitySnapshot.publicEndpointAbuse.length,
    },
    observability: {
      failedAiRequestCount: input.failedAiRequestCount,
      fallbackAiRequestCount: input.fallbackAiRequestCount,
      deniedPermissionCount: input.deniedPermissionCount,
      partialPermissionCount: input.partialPermissionCount,
      redactedFieldEventCount: input.redactedFieldEventCount,
      recentFailureAt: input.recentFailureAt,
    },
  };
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

  const [
    costSettings,
    modelGroups,
    maskingRows,
    totalRequests,
    policy,
    securitySnapshot,
    failedAiRequestCount,
    fallbackAiRequestCount,
    deniedPermissionCount,
    partialPermissionCount,
    recentFailure,
  ] = await Promise.all([
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
    getAiGovernancePolicy(db, tenantId),
    getSecurityHardeningSnapshot(db, tenantId),
    db.aiRequestLog.count({ where: { ...where, status: 'FAILED' } }),
    db.aiRequestLog.count({ where: { ...where, status: 'FALLBACK' } }),
    db.aiRequestLog.count({ where: { ...where, permissionCheckResult: 'DENIED' } }),
    db.aiRequestLog.count({ where: { ...where, permissionCheckResult: 'PARTIAL' } }),
    db.aiRequestLog.findFirst({
      where: { ...where, status: { in: ['FAILED', 'FALLBACK'] } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
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
  const costSummary: AiGovernanceCostSummary = {
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
  };

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
    costSummary,
    modelUsage,
    maskingReport,
    enterpriseControlCenter: buildEnterpriseControlCenter({
      generatedAt: now,
      policy,
      costSummary,
      securitySnapshot,
      failedAiRequestCount,
      fallbackAiRequestCount,
      deniedPermissionCount,
      partialPermissionCount,
      redactedFieldEventCount: maskingRows.length,
      recentFailureAt: recentFailure?.createdAt ?? null,
    }),
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
