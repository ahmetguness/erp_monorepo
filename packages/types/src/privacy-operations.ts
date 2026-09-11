export type DataSubjectRequestType = "EXPORT" | "ERASURE" | "ANONYMIZATION";
export type DataSubjectRequestStatus = "PENDING_VERIFICATION" | "PENDING_APPROVAL" | "APPROVED" | "COMPLETED" | "REJECTED" | "BLOCKED_LEGAL_HOLD";
export interface DataSubjectRequestDto {
  id: string; tenantId: string; tenantName: string; subjectEmail: string; type: DataSubjectRequestType;
  status: DataSubjectRequestStatus; scope: string[]; reason: string; ticketId: string;
  requestedById: string; verifiedById: string | null; approvedById: string | null;
  identityVerifiedAt: string | null; approvedAt: string | null; completedAt: string | null;
  legalHold: boolean; createdAt: string;
}
export interface CreateDataSubjectRequestInput { tenantId: string; subjectEmail: string; type: DataSubjectRequestType; scope: string[]; reason: string; ticketId: string; }
export interface PrivacyDownloadGrant { url: string; expiresAt: string; }
