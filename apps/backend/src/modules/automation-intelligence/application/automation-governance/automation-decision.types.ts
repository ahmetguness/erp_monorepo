import type { AutomationDomainAction, AutomationDomainTrigger } from '../automation.types.js';

export type AutomationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AutomationConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';
export type AutomationControlMode = 'DRY_RUN' | 'SUGGESTION' | 'APPROVAL_REQUIRED' | 'AUTOMATIC';

export interface AutomationGovernancePolicy {
  approvalThreshold: number;
  minimumAutomaticConfidence: number;
}

export interface AutomationDecisionExplanation {
  version: 1;
  reason: string;
  sources: string[];
  confidence: { score: number; band: AutomationConfidenceBand };
  risk: { level: AutomationRiskLevel; reasons: string[] };
  impact: { matchedRecords: number; estimatedMonetaryAmount: number | null; currency: 'TRY' };
  control: {
    mode: AutomationControlMode;
    requiresApproval: boolean;
    approvalThreshold: number;
    dryRun: boolean;
    idempotencyKey: string;
    reversible: boolean;
    compensation: string;
  };
  trigger: AutomationDomainTrigger;
  action: AutomationDomainAction;
}

export interface AutomationDecisionInput {
  tenantId: string;
  ruleId: string;
  trigger: AutomationDomainTrigger;
  action: AutomationDomainAction;
  reason: string;
  sources: string[];
  confidence: number;
  matchedRecords: number;
  estimatedMonetaryAmount: number | null;
  dryRun: boolean;
}
