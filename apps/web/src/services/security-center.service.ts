import type { PlatformSecurityCenter, PlatformSecurityFinding, UpdateSecurityFindingInput } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

interface DataResponse<T> { data: T; }
export async function getSecurityCenter(): Promise<PlatformSecurityCenter> {
  return (await adminApiClient.get<DataResponse<PlatformSecurityCenter>>("/api/admin/security/findings")).data.data;
}
export async function scanSecurityCenter(): Promise<PlatformSecurityCenter> {
  return (await adminApiClient.post<DataResponse<PlatformSecurityCenter>>("/api/admin/security/scan")).data.data;
}
export async function updateSecurityFinding(id: string, input: UpdateSecurityFindingInput): Promise<PlatformSecurityFinding> {
  return (await adminApiClient.patch<DataResponse<PlatformSecurityFinding>>(`/api/admin/security/findings/${id}`, input)).data.data;
}
export async function createSecurityTicket(id: string, ticketId?: string): Promise<PlatformSecurityFinding> {
  return (await adminApiClient.post<DataResponse<PlatformSecurityFinding>>(`/api/admin/security/findings/${id}/ticket`, { ticketId })).data.data;
}
