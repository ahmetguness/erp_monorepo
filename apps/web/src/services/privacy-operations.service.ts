import type {
  CreateDataSubjectRequestInput,
  DataSubjectRequestDto,
  PrivacyDownloadGrant,
} from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

interface DataResponse<T> {
  data: T;
}

export interface CreateLegalHoldInput {
  tenantId: string;
  subjectEmail?: string;
  reason: string;
}

export async function listPrivacyRequests(): Promise<DataSubjectRequestDto[]> {
  const response = await adminApiClient.get<DataResponse<DataSubjectRequestDto[]>>(
    "/api/admin/privacy/requests",
  );
  return response.data.data;
}

export async function createPrivacyRequest(
  input: CreateDataSubjectRequestInput,
): Promise<void> {
  await adminApiClient.post("/api/admin/privacy/requests", input);
}

export async function verifyPrivacyIdentity(id: string, evidence: string): Promise<void> {
  await adminApiClient.post(`/api/admin/privacy/requests/${id}/verify`, { evidence });
}

export async function decidePrivacyRequest(
  id: string,
  approve: boolean,
  reason: string,
): Promise<void> {
  await adminApiClient.post(`/api/admin/privacy/requests/${id}/decision`, {
    approve,
    reason,
  });
}

export async function executePrivacyRequest(id: string): Promise<void> {
  await adminApiClient.post(`/api/admin/privacy/requests/${id}/execute`);
}

export async function grantPrivacyDownload(id: string): Promise<PrivacyDownloadGrant> {
  const response = await adminApiClient.post<DataResponse<PrivacyDownloadGrant>>(
    `/api/admin/privacy/requests/${id}/download-grant`,
  );
  return response.data.data;
}

export async function downloadPrivacyExport(id: string): Promise<void> {
  const grant = await grantPrivacyDownload(id);
  const response = await adminApiClient.get<DataResponse<Record<string, unknown>>>(
    grant.url,
  );
  const blob = new Blob([JSON.stringify(response.data.data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `privacy-export-${id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function createLegalHold(input: CreateLegalHoldInput): Promise<void> {
  await adminApiClient.post("/api/admin/privacy/legal-holds", input);
}
