import type { PrismaClient } from '@prisma/client';
import { checkAiGovernanceCostLimit } from '../ai-governance-insights.service.js';
import { AI_POLICY_KEYS, AI_POLICY_MODULE } from './governance-settings.js';
import { getAiGovernancePolicy, type AiGovernancePolicy } from './governance-policy.js';
export { getAiGovernancePolicy } from './governance-policy.js';
export type { AiDataSharingPolicy, AiGovernancePolicy } from './governance-policy.js';

export interface AiPolicyDecision {
  allowed: boolean;
  reason: string | null;
  policy: AiGovernancePolicy;
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
  const costGuard = await checkAiGovernanceCostLimit(db, tenantId);
  if (!costGuard.allowed) {
    return {
      allowed: false,
      reason: costGuard.reason,
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
