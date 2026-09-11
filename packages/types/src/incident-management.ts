export type IncidentSeverity = "SEV1" | "SEV2" | "SEV3";
export type IncidentStatus =
  | "INVESTIGATING"
  | "IDENTIFIED"
  | "MONITORING"
  | "RESOLVED";
export type IncidentCommunicationStatus =
  | "PENDING_APPROVAL"
  | "PUBLISHED"
  | "REJECTED";

export interface IncidentTenantImpact {
  tenantId: string;
  tenantName: string;
}

export interface IncidentTimelineEntry {
  id: string;
  type: "CREATED" | "UPDATE" | "STATUS" | "COMMUNICATION" | "POSTMORTEM";
  message: string;
  actorName: string;
  createdAt: string;
}

export interface IncidentCommunication {
  id: string;
  message: string;
  status: IncidentCommunicationStatus;
  recipientCount: number;
  requestedByName: string;
  approvedByName: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface Incident {
  id: string;
  alertId: string | null;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  owner: string;
  runbookUrl: string;
  rootCause: string | null;
  resolution: string | null;
  createdByName: string;
  affectedTenants: IncidentTenantImpact[];
  timeline: IncidentTimelineEntry[];
  communications: IncidentCommunication[];
  createdAt: string;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface PublicStatusIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  latestMessage: string;
  publishedAt: string;
}
