export type UnifiedIntentRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type UnifiedIntentStatus = 'READY' | 'NEEDS_CLARIFICATION';
export type UnifiedCommandMode = 'SEARCH' | 'COMMAND' | 'AMBIGUOUS';

export interface UnifiedSearchResult {
  id: string;
  type: string;
  kind: 'record' | 'action';
  module: string;
  title: string;
  subtitle: string | null;
  href: string;
  status: string | null;
  date: string | null;
  amount: string | null;
  meta: Array<{ label: string; value: string }>;
}

export interface UnifiedIntentOption {
  id: string;
  label: string;
  description: string;
  href: string;
}

export interface UnifiedIntentPreview {
  id: string;
  title: string;
  explanation: string;
  confidence: number;
  risk: UnifiedIntentRisk;
  status: UnifiedIntentStatus;
  requiresConfirmation: boolean;
  href: string | null;
  options: UnifiedIntentOption[];
}

export interface UnifiedCommandInput {
  tenantId: string;
  userId: string;
  query: string;
  limit: number;
  recentHrefs: string[];
}

export interface UnifiedCommandResponse {
  query: string;
  mode: UnifiedCommandMode;
  results: UnifiedSearchResult[];
  intent: UnifiedIntentPreview | null;
  contextualShortcuts: UnifiedSearchResult[];
}

export interface ConfirmUnifiedCommandInput extends UnifiedCommandInput {
  intentId: string;
  selectedOptionId: string | null;
  confirmed: boolean;
}

export interface UnifiedCommandHandoff {
  intentId: string;
  href: string;
  message: string;
  mutationExecuted: false;
}

export interface UnifiedCommandFailure {
  kind: 'FORBIDDEN' | 'VALIDATION';
  message: string;
}
