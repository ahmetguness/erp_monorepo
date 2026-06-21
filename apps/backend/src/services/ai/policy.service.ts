import type { PrismaClient } from '@prisma/client';

export type AiDataSharingPolicy = 'BUSINESS_CONTEXT' | 'NO_ENTITY_CONTEXT';

export interface AiGovernancePolicy {
  enabled: boolean;
  dataSharingPolicy: AiDataSharingPolicy;
  logPrompts: boolean;
}

export interface AiPolicyDecision {
  allowed: boolean;
  reason: string | null;
  policy: AiGovernancePolicy;
}

export const AI_POLICY_MODULE = 'ai';
export const AI_POLICY_KEYS = {
  enabled: 'enabled',
  dataSharingPolicy: 'data_sharing_policy',
  logPrompts: 'log_prompts',
} as const;

const DEFAULT_AI_POLICY: AiGovernancePolicy = {
  enabled: true,
  dataSharingPolicy: 'BUSINESS_CONTEXT',
  logPrompts: true,
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function parseDataSharingPolicy(value: string | undefined): AiDataSharingPolicy {
  return value === 'NO_ENTITY_CONTEXT' ? value : DEFAULT_AI_POLICY.dataSharingPolicy;
}

export async function getAiGovernancePolicy(db: PrismaClient, tenantId: string): Promise<AiGovernancePolicy> {
  const settings = await db.moduleSetting.findMany({
    where: { tenantId, module: AI_POLICY_MODULE },
    select: { key: true, value: true },
  });
  const settingByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    enabled: parseBoolean(settingByKey.get(AI_POLICY_KEYS.enabled), DEFAULT_AI_POLICY.enabled),
    dataSharingPolicy: parseDataSharingPolicy(settingByKey.get(AI_POLICY_KEYS.dataSharingPolicy)),
    logPrompts: parseBoolean(settingByKey.get(AI_POLICY_KEYS.logPrompts), DEFAULT_AI_POLICY.logPrompts),
  };
}

export async function setAiGovernancePolicy(
  db: PrismaClient,
  tenantId: string,
  policy: AiGovernancePolicy,
): Promise<AiGovernancePolicy> {
  await db.$transaction([
    db.moduleSetting.upsert({
      where: { tenantId_module_key: { tenantId, module: AI_POLICY_MODULE, key: AI_POLICY_KEYS.enabled } },
      create: { tenantId, module: AI_POLICY_MODULE, key: AI_POLICY_KEYS.enabled, value: String(policy.enabled) },
      update: { value: String(policy.enabled) },
    }),
    db.moduleSetting.upsert({
      where: { tenantId_module_key: { tenantId, module: AI_POLICY_MODULE, key: AI_POLICY_KEYS.dataSharingPolicy } },
      create: { tenantId, module: AI_POLICY_MODULE, key: AI_POLICY_KEYS.dataSharingPolicy, value: policy.dataSharingPolicy },
      update: { value: policy.dataSharingPolicy },
    }),
    db.moduleSetting.upsert({
      where: { tenantId_module_key: { tenantId, module: AI_POLICY_MODULE, key: AI_POLICY_KEYS.logPrompts } },
      create: { tenantId, module: AI_POLICY_MODULE, key: AI_POLICY_KEYS.logPrompts, value: String(policy.logPrompts) },
      update: { value: String(policy.logPrompts) },
    }),
  ]);

  return policy;
}

export async function assertAiAllowed(db: PrismaClient, tenantId: string): Promise<AiPolicyDecision> {
  const policy = await getAiGovernancePolicy(db, tenantId);
  if (!policy.enabled) {
    return {
      allowed: false,
      reason: 'AI tenant politikasinda kapali.',
      policy,
    };
  }
  return { allowed: true, reason: null, policy };
}

export function buildPolicyContext(policy: AiGovernancePolicy): Record<string, string | boolean> {
  return {
    aiEnabled: policy.enabled,
    dataSharingPolicy: policy.dataSharingPolicy,
    logPrompts: policy.logPrompts,
  };
}
