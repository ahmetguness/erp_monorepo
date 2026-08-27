import type { PrismaClient } from '@prisma/client';
import { AI_POLICY_KEYS, AI_POLICY_MODULE } from './governance-settings.js';

export type AiDataSharingPolicy = 'BUSINESS_CONTEXT' | 'NO_ENTITY_CONTEXT';

export interface AiGovernancePolicy {
  enabled: boolean;
  dataSharingPolicy: AiDataSharingPolicy;
  logPrompts: boolean;
}

const DEFAULT_AI_POLICY: Readonly<AiGovernancePolicy> = {
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
