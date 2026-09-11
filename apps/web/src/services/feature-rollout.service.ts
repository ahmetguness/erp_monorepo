import type { CreateFeatureRolloutInput, FeatureRollout, PendingAdminChangeResult } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

export async function getFeatureRollouts(): Promise<FeatureRollout[]> {
  const response = await adminApiClient.get("/api/admin/feature-rollouts");
  return response.data.data;
}
export async function createFeatureRollout(input: CreateFeatureRolloutInput): Promise<FeatureRollout> {
  const response = await adminApiClient.post("/api/admin/feature-rollouts", input);
  return response.data.data;
}
export async function activateFeatureRollout(id: string): Promise<PendingAdminChangeResult> {
  const response = await adminApiClient.post(`/api/admin/feature-rollouts/${id}/activate`);
  return response.data.data;
}
export async function stopFeatureRollout(id: string, reason: string, killSwitch: boolean): Promise<FeatureRollout> {
  const response = await adminApiClient.post(`/api/admin/feature-rollouts/${id}/stop`, { reason, killSwitch });
  return response.data.data;
}
export async function reportFeatureRolloutMetric(id: string, errorRatePct: number): Promise<FeatureRollout> {
  const response = await adminApiClient.post(`/api/admin/feature-rollouts/${id}/metrics`, { errorRatePct });
  return response.data.data;
}
