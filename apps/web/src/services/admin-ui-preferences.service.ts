import type { AdminUiPreferences } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";
interface DataResponse<T> { data: T }
export async function getAdminUiPreferences(): Promise<AdminUiPreferences> {
  return (await adminApiClient.get<DataResponse<AdminUiPreferences>>("/api/admin/ui-preferences")).data.data;
}
export async function updateAdminUiPreferences(input: AdminUiPreferences): Promise<AdminUiPreferences> {
  return (await adminApiClient.put<DataResponse<AdminUiPreferences>>("/api/admin/ui-preferences", input)).data.data;
}
