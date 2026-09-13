import { describe, expect, it } from 'vitest';
import { GetPilotReadiness } from '../../../src/modules/platform/pilot-readiness/application/queries/get-pilot-readiness.js';
import type {
  DatabaseIntegrityEvidence,
  ReadinessEvidenceRepository,
} from '../../../src/modules/platform/pilot-readiness/application/ports/readiness-evidence.repository.js';

class StubEvidenceRepository implements ReadinessEvidenceRepository {
  constructor(private readonly evidence: DatabaseIntegrityEvidence) {}

  async getDatabaseIntegrityEvidence(): Promise<DatabaseIntegrityEvidence> {
    return this.evidence;
  }
}

const cleanEvidence: DatabaseIntegrityEvidence = {
  negativeStockLevelCount: 0,
  crossTenantStockLevelCount: 0,
  crossTenantInvoiceCount: 0,
};

describe('GetPilotReadiness', () => {
  it('fails closed when operational attestations are missing', async () => {
    const report = await new GetPilotReadiness(
      new StubEvidenceRepository(cleanEvidence),
      { deterministicFlowRuns: 0 },
      () => new Date('2026-09-13T12:00:00.000Z'),
    ).execute('tenant-1');

    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toEqual(['retry_safety', 'tenant_isolation', 'deterministic_flow']);
  });

  it('returns GO only when every criterion has valid evidence', async () => {
    const verifiedAt = '2026-09-13T11:00:00.000Z';
    const report = await new GetPilotReadiness(
      new StubEvidenceRepository(cleanEvidence),
      {
        retrySafetyVerifiedAt: verifiedAt,
        tenantIsolationVerifiedAt: verifiedAt,
        deterministicFlowVerifiedAt: verifiedAt,
        deterministicFlowRuns: 3,
      },
    ).execute('tenant-1');

    expect(report.decision).toBe('GO');
    expect(report.blockers).toEqual([]);
    expect(report.checks.every((check) => check.status === 'PASS')).toBe(true);
  });

  it('blocks GO when tenant-scoped database integrity is violated', async () => {
    const verifiedAt = '2026-09-13T11:00:00.000Z';
    const report = await new GetPilotReadiness(
      new StubEvidenceRepository({ ...cleanEvidence, crossTenantInvoiceCount: 1 }),
      {
        retrySafetyVerifiedAt: verifiedAt,
        tenantIsolationVerifiedAt: verifiedAt,
        deterministicFlowVerifiedAt: verifiedAt,
        deterministicFlowRuns: 3,
      },
    ).execute('tenant-1');

    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('tenant_isolation');
  });
});
