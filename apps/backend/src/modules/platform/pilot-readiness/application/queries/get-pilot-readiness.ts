import type { PilotReadinessCheck, PilotReadinessReport } from '@repo/types';
import { buildPilotReadinessReport } from '../../domain/readiness-policy.js';
import type { ReadinessEvidenceRepository } from '../ports/readiness-evidence.repository.js';

export interface PilotReadinessAttestations {
  retrySafetyVerifiedAt?: string;
  tenantIsolationVerifiedAt?: string;
  deterministicFlowVerifiedAt?: string;
  deterministicFlowRuns: number;
}

function validDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export class GetPilotReadiness {
  constructor(
    private readonly repository: ReadinessEvidenceRepository,
    private readonly attestations: PilotReadinessAttestations,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(tenantId: string): Promise<PilotReadinessReport> {
    const evidence = await this.repository.getDatabaseIntegrityEvidence(tenantId);
    const retryVerifiedAt = validDate(this.attestations.retrySafetyVerifiedAt);
    const tenantVerifiedAt = validDate(this.attestations.tenantIsolationVerifiedAt);
    const deterministicVerifiedAt = validDate(this.attestations.deterministicFlowVerifiedAt);
    const stockPassed = evidence.negativeStockLevelCount === 0 && evidence.crossTenantStockLevelCount === 0;
    const tenantPassed = Boolean(tenantVerifiedAt) && evidence.crossTenantInvoiceCount === 0 && evidence.crossTenantStockLevelCount === 0;
    const deterministicPassed = Boolean(deterministicVerifiedAt) && this.attestations.deterministicFlowRuns >= 3;
    const checks: PilotReadinessCheck[] = [
      {
        key: 'stock_integrity', label: 'Stok bütünlüğü', status: stockPassed ? 'PASS' : 'FAIL',
        detail: stockPassed ? 'Negatif veya tenant-çapraz stok seviyesi bulunmadı.' : 'Stok bütünlüğünde pilotu engelleyen bulgu var.',
        evidence: [`Negatif stok seviyesi: ${evidence.negativeStockLevelCount}`, `Tenant-çapraz stok seviyesi: ${evidence.crossTenantStockLevelCount}`],
      },
      {
        key: 'retry_safety', label: 'Retry ve idempotency güvenliği', status: retryVerifiedAt ? 'PASS' : 'FAIL',
        detail: retryVerifiedAt ? 'Retry/idempotency paketi doğrulanmış.' : 'Retry/idempotency doğrulama kanıtı tanımlı değil.',
        evidence: retryVerifiedAt ? [`Doğrulama: ${retryVerifiedAt}`] : ['PILOT_RETRY_VERIFIED_AT eksik veya geçersiz.'],
      },
      {
        key: 'tenant_isolation', label: 'Tenant izolasyonu', status: tenantPassed ? 'PASS' : 'FAIL',
        detail: tenantPassed ? 'Tenant izolasyonu doğrulandı ve çapraz kayıt bulunmadı.' : 'Tenant izolasyonu kanıtı veya veri bütünlüğü koşulu eksik.',
        evidence: [`Tenant-çapraz fatura: ${evidence.crossTenantInvoiceCount}`, `Tenant-çapraz stok: ${evidence.crossTenantStockLevelCount}`, tenantVerifiedAt ? `Doğrulama: ${tenantVerifiedAt}` : 'PILOT_TENANT_ISOLATION_VERIFIED_AT eksik veya geçersiz.'],
      },
      {
        key: 'deterministic_flow', label: 'Deterministik pilot akışı', status: deterministicPassed ? 'PASS' : 'FAIL',
        detail: deterministicPassed ? 'Satış → Üretim → Sevkiyat → Fatura → Tahsilat zinciri en az üç kez doğrulandı.' : 'En az üç başarılı deterministik koşu kanıtlanmadı.',
        evidence: [`Başarılı koşu: ${this.attestations.deterministicFlowRuns}/3`, deterministicVerifiedAt ? `Doğrulama: ${deterministicVerifiedAt}` : 'PILOT_DETERMINISM_VERIFIED_AT eksik veya geçersiz.'],
      },
    ];
    return buildPilotReadinessReport(checks, this.now());
  }
}
