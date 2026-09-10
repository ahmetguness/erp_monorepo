export const TENANT_LIFECYCLE_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
  "ARCHIVED",
  "DELETION_SCHEDULED",
  "DELETED",
] as const;
export type TenantLifecycleStatus = (typeof TENANT_LIFECYCLE_STATUSES)[number];
export const TENANT_TRANSITIONS = {
  TRIAL: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "CANCELLED"],
  SUSPENDED: ["ACTIVE", "CANCELLED"],
  CANCELLED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["CANCELLED", "DELETION_SCHEDULED"],
  DELETION_SCHEDULED: ["ARCHIVED", "DELETED"],
  DELETED: ["ARCHIVED"],
} as const satisfies Record<
  TenantLifecycleStatus,
  readonly TenantLifecycleStatus[]
>;
export interface ClosureChecklist {
  ownerNotified: boolean;
  balancesReviewed: boolean;
  externalBackupVerified: boolean;
  retentionReviewed: boolean;
}
export interface TenantLifecycleInput {
  action: "TRANSITION" | "LEGAL_HOLD";
  targetStatus?: TenantLifecycleStatus;
  legalHold?: boolean;
  retentionUntil?: string;
  deletionNotBefore?: string;
  exportId?: string;
  checklist?: ClosureChecklist;
  reason: string;
  impact: string;
  ticketId: string;
}
export interface TenantLifecycleRequestSummary {
  id: string;
  state: "PENDING" | "APPLIED" | "REJECTED";
  input: TenantLifecycleInput;
  fromStatus: TenantLifecycleStatus;
  requestedById: string;
  requestedByName: string;
  decidedById: string | null;
  createdAt: string;
  decidedAt: string | null;
}
export interface TenantLifecycleSnapshot {
  tenantId: string;
  companyName: string;
  status: TenantLifecycleStatus;
  version: number;
  legalHold: boolean;
  retentionUntil: string | null;
  deletionNotBefore: string | null;
  deletedAt: string | null;
  transitions: readonly TenantLifecycleStatus[];
  requests: TenantLifecycleRequestSummary[];
  exports: Array<{
    id: string;
    createdAt: string;
    digest: string;
    version: number;
  }>;
}
