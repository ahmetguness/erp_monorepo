import { prisma } from '../../../../lib/prisma.js';
import type { AutomationGovernancePolicy, AutomationGovernancePolicyRepository } from '../../application/automation-governance/index.js';

const MODULE = 'automation_governance';
const DEFAULT_POLICY: AutomationGovernancePolicy = { approvalThreshold: 100000, minimumAutomaticConfidence: 0.85 };

function finiteNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class PrismaAutomationGovernancePolicyRepository implements AutomationGovernancePolicyRepository {
  async get(tenantId: string): Promise<AutomationGovernancePolicy> {
    const settings = await prisma.moduleSetting.findMany({ where: { tenantId, module: MODULE } });
    const values = new Map(settings.map((setting) => [setting.key, setting.value]));
    return {
      approvalThreshold: Math.max(0, finiteNumber(values.get('approvalThreshold'), DEFAULT_POLICY.approvalThreshold)),
      minimumAutomaticConfidence: Math.min(1, Math.max(0, finiteNumber(values.get('minimumAutomaticConfidence'), DEFAULT_POLICY.minimumAutomaticConfidence))),
    };
  }

  async save(tenantId: string, policy: AutomationGovernancePolicy): Promise<AutomationGovernancePolicy> {
    await prisma.$transaction([
      prisma.moduleSetting.upsert({
        where: { tenantId_module_key: { tenantId, module: MODULE, key: 'approvalThreshold' } },
        create: { tenantId, module: MODULE, key: 'approvalThreshold', value: String(policy.approvalThreshold) },
        update: { value: String(policy.approvalThreshold) },
      }),
      prisma.moduleSetting.upsert({
        where: { tenantId_module_key: { tenantId, module: MODULE, key: 'minimumAutomaticConfidence' } },
        create: { tenantId, module: MODULE, key: 'minimumAutomaticConfidence', value: String(policy.minimumAutomaticConfidence) },
        update: { value: String(policy.minimumAutomaticConfidence) },
      }),
    ]);
    return policy;
  }
}
