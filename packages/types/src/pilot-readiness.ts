export const PILOT_READINESS_CHECK_KEYS = ['stock_integrity', 'retry_safety', 'tenant_isolation', 'deterministic_flow'] as const;
export type PilotReadinessCheckKey = (typeof PILOT_READINESS_CHECK_KEYS)[number];
export type PilotReadinessStatus = 'PASS' | 'FAIL';
export type PilotReadinessDecision = 'GO' | 'NO_GO';

export interface PilotReadinessCheck {
  key: PilotReadinessCheckKey;
  label: string;
  status: PilotReadinessStatus;
  detail: string;
  evidence: readonly string[];
}

export interface PilotReadinessReport {
  decision: PilotReadinessDecision;
  generatedAt: string;
  checks: readonly PilotReadinessCheck[];
  blockers: readonly PilotReadinessCheckKey[];
}
