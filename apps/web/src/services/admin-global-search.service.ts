import type { AdminGlobalSearchResponse } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

interface DataResponse<T> {
  data: T;
}

export async function searchAdminResources(
  query: string,
): Promise<AdminGlobalSearchResponse> {
  const response = await adminApiClient.get<
    DataResponse<AdminGlobalSearchResponse>
  >("/api/admin/global-search", { params: { q: query } });
  return response.data.data;
}
