import type { OperationInterventionInput, OperationInterventionPreview, OperationItemDetail, OperationItemKind } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

export async function getOperationItem(id: string, kind: OperationItemKind): Promise<OperationItemDetail> {
  const response = await adminApiClient.get(`/api/admin/operation-items/${encodeURIComponent(id)}`, { params: { kind } });
  return response.data.data;
}

export async function interveneOperations(input: OperationInterventionInput): Promise<OperationInterventionPreview> {
  const response = await adminApiClient.post("/api/admin/operation-interventions", input);
  return response.data.data;
}
