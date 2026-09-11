export type PlatformAuditOutcome = "SUCCESS" | "DENIED" | "FAILED";
export interface PlatformAuditDiff { field: string; before: unknown; after: unknown; }
export interface PlatformAuditActor { id: string; name: string; email: string; }
export interface PlatformAuditEntry {
  id: string; actor: PlatformAuditActor | null; action: string; module: string;
  targetType: string; targetId: string | null; outcome: PlatformAuditOutcome;
  reason: string | null; approvalId: string | null; ipAddress: string | null;
  device: string | null; requestId: string | null; correlationId: string | null;
  changes: PlatformAuditDiff[]; previousHash: string | null; hash: string;
  retentionUntil: string; createdAt: string;
}
export interface PlatformAuditPage {
  data: PlatformAuditEntry[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
  integrity: { valid: boolean; checked: number; brokenAtId: string | null };
  retentionDays: number;
}
export interface PlatformAuditFilters {
  page?: number; limit?: number; from?: string; to?: string; module?: string;
  actorId?: string; target?: string; outcome?: PlatformAuditOutcome;
}
