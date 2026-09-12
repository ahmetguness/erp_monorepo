import type {
  AdminDashboardRangeDays,
  AdminDecisionDashboard,
} from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

interface DataResponse<T> {
  data: T;
}

export async function getAdminDecisionDashboard(
  rangeDays: AdminDashboardRangeDays,
): Promise<AdminDecisionDashboard> {
  const response = await adminApiClient.get<
    DataResponse<AdminDecisionDashboard>
  >("/api/admin/decision-dashboard", { params: { rangeDays } });
  return response.data.data;
}
