import type { AlertHistoryItem, DeploymentMarker, ObservabilityRange, PersistentObservabilityDashboard, SloDefinition } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

export async function getPersistentObservability(range: ObservabilityRange): Promise<PersistentObservabilityDashboard> {
  const response = await adminApiClient.get("/api/admin/observability/history", { params: { range } });
  return response.data.data;
}
export async function saveSlo(input: Omit<SloDefinition, "id">): Promise<SloDefinition> {
  const response = await adminApiClient.put("/api/admin/observability/slos", input);
  return response.data.data;
}
export async function setAlertOwnership(id: string, input: Pick<AlertHistoryItem, "owner" | "runbookUrl" | "notificationChannel">): Promise<AlertHistoryItem> {
  const response = await adminApiClient.put(`/api/admin/observability/alerts/${id}/ownership`, input);
  return response.data.data;
}
export async function silenceAlert(id: string, until: string, reason: string): Promise<AlertHistoryItem> {
  const response = await adminApiClient.post(`/api/admin/observability/alerts/${id}/silence`, { until, reason });
  return response.data.data;
}
export async function createDeploymentMarker(input: Omit<DeploymentMarker, "id">): Promise<DeploymentMarker> {
  const response = await adminApiClient.post("/api/admin/observability/deployments", input);
  return response.data.data;
}
