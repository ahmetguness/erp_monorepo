export interface DatabaseIntegrityEvidence {
  negativeStockLevelCount: number;
  crossTenantStockLevelCount: number;
  crossTenantInvoiceCount: number;
}

export interface ReadinessEvidenceRepository {
  getDatabaseIntegrityEvidence(tenantId: string): Promise<DatabaseIntegrityEvidence>;
}
