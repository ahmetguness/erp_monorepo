export type DemoRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "PROVISIONING"
  | "PROVISIONED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export interface DemoDuplicateWarning {
  kind: "EMAIL" | "COMPANY";
  message: string;
  relatedRequestId?: string;
}

export interface DemoRequestHistoryItem {
  id: string;
  action: string;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface AdminDemoRequest {
  id: string;
  fullName: string;
  companyName: string;
  email: string;
  phone: string | null;
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
  status: DemoRequestStatus;
  tenantId: string | null;
  notes: string | null;
  rejectedReason: string | null;
  processedBy: string | null;
  ownerId: string | null;
  slaDueAt: string;
  slaBreached: boolean;
  duplicateWarnings: DemoDuplicateWarning[];
  history: DemoRequestHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DemoProvisioningPreview {
  requestId: string;
  companyName: string;
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
  suggestedSlug: string;
  trialDays: number;
  modules: string[];
  duplicateWarnings: DemoDuplicateWarning[];
}

export interface DemoRequestPage {
  data: AdminDemoRequest[];
  total: number;
  page: number;
  limit: number;
}
