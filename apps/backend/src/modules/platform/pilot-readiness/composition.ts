import type { PilotReadinessReport } from '@repo/types';
import { GetPilotReadiness, type PilotReadinessAttestations } from './application/queries/get-pilot-readiness.js';
import { PrismaReadinessEvidenceRepository } from './infrastructure/persistence/prisma-readiness-evidence.repository.js';

const evidenceRepository = new PrismaReadinessEvidenceRepository();

function readRunCount(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function readAttestations(): PilotReadinessAttestations {
  return {
    retrySafetyVerifiedAt: process.env.PILOT_RETRY_VERIFIED_AT,
    tenantIsolationVerifiedAt: process.env.PILOT_TENANT_ISOLATION_VERIFIED_AT,
    deterministicFlowVerifiedAt: process.env.PILOT_DETERMINISM_VERIFIED_AT,
    deterministicFlowRuns: readRunCount(process.env.PILOT_DETERMINISM_RUNS),
  };
}

export async function getPilotReadiness(tenantId: string): Promise<PilotReadinessReport> {
  return new GetPilotReadiness(evidenceRepository, readAttestations()).execute(tenantId);
}
