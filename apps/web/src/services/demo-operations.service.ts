import type {
  AdminDemoRequest,
  DemoProvisioningPreview,
  DemoRequestPage,
  DemoRequestStatus,
} from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

interface DataResponse<T> {
  data: T;
}

export interface DemoRequestFilters {
  status?: DemoRequestStatus;
  search?: string;
  page?: number;
}

export async function listDemoRequests(
  filters: DemoRequestFilters,
): Promise<DemoRequestPage> {
  const response = await adminApiClient.get<DemoRequestPage>(
    "/api/admin/demo-requests",
    {
      params: { ...filters, limit: 50 },
    },
  );
  return response.data;
}

export async function previewDemoRequest(
  id: string,
): Promise<DemoProvisioningPreview> {
  const response = await adminApiClient.get<
    DataResponse<DemoProvisioningPreview>
  >(`/api/admin/demo-requests/${id}/preview`);
  return response.data.data;
}

export async function approveDemoRequest(id: string): Promise<void> {
  await adminApiClient.post(`/api/admin/demo-requests/${id}/approve`);
}

export async function rejectDemoRequest(
  id: string,
  reason: string,
): Promise<void> {
  await adminApiClient.post(`/api/admin/demo-requests/${id}/reject`, {
    reason,
  });
}

export async function assignDemoRequest(
  id: string,
  ownerId: string,
): Promise<void> {
  await adminApiClient.post(`/api/admin/demo-requests/${id}/assign`, {
    ownerId,
  });
}

export async function addDemoRequestNote(
  id: string,
  note: string,
): Promise<void> {
  await adminApiClient.post(`/api/admin/demo-requests/${id}/notes`, { note });
}

export type { AdminDemoRequest };
