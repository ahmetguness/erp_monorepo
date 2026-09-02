import { describe, expect, it } from 'vitest';
import { BulkImportAssistanceService, createImportFingerprint, type MappingProfile, type MappingProfileRepository, type SaveMappingProfileInput } from '../../src/modules/platform/application/bulk-import-assistance/index.js';

class MemoryProfiles implements MappingProfileRepository {
  private profiles: MappingProfile[] = [];
  async list(): Promise<MappingProfile[]> { return this.profiles; }
  async save(_tenantId: string, input: SaveMappingProfileInput): Promise<MappingProfile> {
    const profile: MappingProfile = { id: 'profile-1', name: input.name, target: input.target, fingerprint: createImportFingerprint(input.headers), mappings: input.mappings, updatedAt: new Date(0).toISOString() };
    this.profiles = [profile];
    return profile;
  }
}

describe('BulkImportAssistanceService', () => {
  it('normalizes localized values and separates duplicate review from automatic fixes', async () => {
    const service = new BulkImportAssistanceService(new MemoryProfiles());
    const result = await service.analyze('tenant-1', {
      target: 'products', headers: ['Stok Kodu', 'Satış Fiyatı'],
      rows: [{ 'Stok Kodu': 'P-1', 'Satış Fiyatı': '1.250,50' }, { 'Stok Kodu': 'P-1', 'Satış Fiyatı': ' 20 ' }],
    });
    expect(result.normalizedRows[0]?.salesPrice).toBe(1250.5);
    expect(result.summary.duplicateCandidates).toBe(1);
    expect(result.summary.autoFixed).toBeGreaterThan(0);
    expect(result.execution.resumeSupported).toBe(false);
    expect(result.execution.status).toBe('planning_only');
  });

  it('reuses a learned tenant mapping profile', async () => {
    const repository = new MemoryProfiles();
    await repository.save('tenant-1', { name: 'Özel', target: 'contacts', headers: ['Müşteri'], mappings: [{ source: 'Müşteri', target: 'name', confidence: 1, learned: true }] });
    const result = await new BulkImportAssistanceService(repository).analyze('tenant-1', { target: 'contacts', headers: ['Müşteri'], rows: [{ Müşteri: 'Acme' }] });
    expect(result.profile?.name).toBe('Özel');
    expect(result.mappings[0]?.learned).toBe(true);
  });
});
