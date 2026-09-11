export const OBSERVABILITY_RANGES = ["1h", "24h", "7d", "30d"] as const;
export type ObservabilityRange = (typeof OBSERVABILITY_RANGES)[number];
export type ObservabilityScope = "SERVICE" | "TENANT";

export interface ObservabilityPoint {
  metricKey: string;
  scope: ObservabilityScope;
  scopeId: string;
  value: number;
  bucketAt: string;
}
export interface SloDefinition {
  id: string;
  name: string;
  scope: ObservabilityScope;
  scopeId: string;
  metricKey: string;
  targetPercentage: number;
  windowDays: number;
  owner: string;
  runbookUrl: string;
  notificationChannel: string;
  isEnabled: boolean;
}
export interface SloStatus extends SloDefinition {
  sliPercentage: number;
  errorBudgetRemainingPercentage: number;
  sampleCount: number;
}
export interface AlertHistoryItem {
  id: string;
  metricKey: string;
  scope: ObservabilityScope;
  scopeId: string;
  severity: "warning" | "critical";
  status: "OPEN" | "RESOLVED";
  value: number;
  threshold: number;
  owner: string;
  runbookUrl: string;
  notificationChannel: string;
  silencedUntil: string | null;
  openedAt: string;
  resolvedAt: string | null;
}
export interface DeploymentMarker {
  id: string;
  service: string;
  version: string;
  environment: string;
  description: string | null;
  deployedAt: string;
}
export interface CentralLogEntry {
  id: string;
  level: "ERROR" | "WARN" | "INFO";
  service: string;
  message: string;
  requestId: string | null;
  correlationId: string | null;
  occurredAt: string;
}
export interface PersistentObservabilityDashboard {
  range: ObservabilityRange;
  points: ObservabilityPoint[];
  slos: SloStatus[];
  alerts: AlertHistoryItem[];
  deployments: DeploymentMarker[];
  logs: CentralLogEntry[];
}
