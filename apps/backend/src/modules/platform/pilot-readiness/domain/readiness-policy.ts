import type { PilotReadinessCheck, PilotReadinessReport } from '@repo/types';

export function buildPilotReadinessReport(checks: readonly PilotReadinessCheck[], generatedAt: Date): PilotReadinessReport {
  const blockers = checks.filter((check) => check.status === 'FAIL').map((check) => check.key);
  return {
    decision: blockers.length === 0 ? 'GO' : 'NO_GO',
    generatedAt: generatedAt.toISOString(),
    checks,
    blockers,
  };
}
