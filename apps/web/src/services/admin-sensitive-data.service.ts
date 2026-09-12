import type { AdminSensitiveAccessGrant, CreateAdminSensitiveAccessGrantInput } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";
interface DataResponse<T> { data: T }
export async function revealSensitiveData(input: CreateAdminSensitiveAccessGrantInput): Promise<AdminSensitiveAccessGrant> {
  return (await adminApiClient.post<DataResponse<AdminSensitiveAccessGrant>>("/api/admin/sensitive-data/access-grants", input)).data.data;
}
