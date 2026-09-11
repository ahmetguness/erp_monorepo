export const OPERATION_ITEM_KINDS = ["DOMAIN_EVENT", "MARKETPLACE_JOB"] as const;
export type OperationItemKind = (typeof OPERATION_ITEM_KINDS)[number];
export const OPERATION_INTERVENTION_ACTIONS = ["RETRY", "QUARANTINE", "RESOLVE"] as const;
export type OperationInterventionAction = (typeof OPERATION_INTERVENTION_ACTIONS)[number];

export interface OperationItemDetail {
  id: string;
  kind: OperationItemKind;
  tenantId: string;
  name: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  payload: unknown;
  context: unknown;
  lastError: string | null;
  nextRetryAt: string | null;
  quarantinedAt: string | null;
  quarantinedById: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  updatedAt: string;
}

export interface OperationInterventionPreview {
  allowed: boolean;
  action: OperationInterventionAction;
  items: Array<{ id: string; kind: OperationItemKind; allowed: boolean; reason: string; nextAttempt: number }>;
}

export interface OperationInterventionInput {
  items: Array<{ id: string; kind: OperationItemKind }>;
  action: OperationInterventionAction;
  reason: string;
  dryRun: boolean;
}
