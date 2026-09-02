import type { AutomationGovernancePolicy } from './automation-decision.types.js';

export interface AutomationGovernancePolicyRepository {
  get(tenantId: string): Promise<AutomationGovernancePolicy>;
  save(tenantId: string, policy: AutomationGovernancePolicy): Promise<AutomationGovernancePolicy>;
}
