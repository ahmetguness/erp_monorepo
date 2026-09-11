import type { Incident, IncidentSeverity, IncidentStatus } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";

export interface CreateIncidentInput {
  alertId?: string | null;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  owner: string;
  runbookUrl: string;
  affectedTenantIds: string[];
}

const data = <T>(response: { data: { data: T } }): T => response.data.data;
export async function getIncidents(): Promise<Incident[]> {
  return data(await adminApiClient.get("/api/admin/incidents"));
}
export async function createIncident(
  input: CreateIncidentInput,
): Promise<Incident> {
  return data(await adminApiClient.post("/api/admin/incidents", input));
}
export async function updateIncident(
  id: string,
  input: Partial<
    Pick<
      Incident,
      "severity" | "owner" | "runbookUrl" | "rootCause" | "resolution"
    >
  > & { status?: IncidentStatus },
): Promise<Incident> {
  return data(await adminApiClient.patch(`/api/admin/incidents/${id}`, input));
}
export async function addIncidentUpdate(
  id: string,
  message: string,
): Promise<Incident> {
  return data(
    await adminApiClient.post(`/api/admin/incidents/${id}/timeline`, {
      message,
    }),
  );
}
export async function requestIncidentCommunication(
  id: string,
  message: string,
): Promise<Incident> {
  return data(
    await adminApiClient.post(`/api/admin/incidents/${id}/communications`, {
      message,
    }),
  );
}
export async function decideIncidentCommunication(
  communicationId: string,
  decision: "APPROVE" | "REJECT",
  note: string,
): Promise<Incident> {
  return data(
    await adminApiClient.post(
      `/api/admin/incident-communications/${communicationId}/decision`,
      { decision, note },
    ),
  );
}
