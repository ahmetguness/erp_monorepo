export type AutomationAssistantTrigger = 'LOW_STOCK' | 'OVERDUE_INVOICE' | 'HIGH_VALUE_INVOICE' | 'LOW_MARGIN' | 'CHECK_DUE_SOON';
export type AutomationAssistantAction = 'CREATE_TASK' | 'CREATE_NOTIFICATION' | 'DRAFT_REMINDER_EMAIL' | 'REQUEST_APPROVAL' | 'CREATE_PURCHASE_REQUEST_DRAFT';

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
}
