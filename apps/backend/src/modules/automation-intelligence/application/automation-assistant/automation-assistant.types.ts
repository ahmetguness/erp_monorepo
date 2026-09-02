import type { AutomationDomainAction, AutomationDomainTrigger } from '../automation.types.js';

export type AutomationAssistantTrigger = AutomationDomainTrigger;
export type AutomationAssistantAction = AutomationDomainAction;

export interface AutomationAssistantDraft {
  name: string;
  description: string;
  module: string;
  trigger: AutomationAssistantTrigger;
  action: AutomationAssistantAction;
  conditions: Record<string, string | number | boolean>;
  actionConfig: Record<string, string | number | boolean>;
  isActive: false;
}

export interface AutomationSimulation {
  matchedCount: number;
  estimatedMonetaryAmount: number | null;
  examples: Array<{ title: string; detail: string }>;
}

export interface AutomationConflict {
  ruleId: string;
  ruleName: string;
  severity: 'INFO' | 'WARNING';
  reason: string;
}

export interface AutomationAssistantPreview {
  interpretation: string;
  confidence: number;
  draft: AutomationAssistantDraft;
  simulation: AutomationSimulation;
  conflicts: AutomationConflict[];
  recommendedMode: 'SUGGESTION';
  safeguards: string[];
  decision: import('../automation-governance/automation-decision.types.js').AutomationDecisionExplanation;
}
