export type SecurityFindingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SecurityFindingStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type SecurityVerificationStatus = "PASS" | "WARN" | "FAIL";

export interface PlatformSecurityFinding {
  id: string; key: string; title: string; category: string;
  severity: SecurityFindingSeverity; status: SecurityFindingStatus;
  verificationStatus: SecurityVerificationStatus; owner: string | null;
  remediation: string; evidence: string[]; ticketId: string | null;
  firstSeenAt: string; lastSeenAt: string; verifiedAt: string | null; resolvedAt: string | null;
}
export interface PlatformSecuritySummary {
  status: SecurityVerificationStatus; total: number; passing: number;
  warning: number; failing: number; open: number; lastScannedAt: string | null;
}
export interface PlatformSecurityCenter { summary: PlatformSecuritySummary; findings: PlatformSecurityFinding[]; }
export interface UpdateSecurityFindingInput { owner?: string | null; status?: SecurityFindingStatus; }
export interface CreateSecurityTicketInput { ticketId?: string; }
