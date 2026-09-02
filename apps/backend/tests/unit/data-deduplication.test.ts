import { describe, expect, it } from 'vitest';
import { findDuplicateCandidates, normalizeIdentity, type DedupRecord } from '../../src/modules/platform/application/data-deduplication/index.js';

describe('data deduplication matcher', () => {
  it('normalizes Turkish identity values and explains exact identifiers', () => {
    expect(normalizeIdentity(' Şirket İçi ')).toBe('sirketici');
    const records: DedupRecord[] = [
      { id: 'a', label: 'Acme A', values: { name: 'Acme Limited', taxNumber: '123', email: 'a@example.com', phone: null } },
      { id: 'b', label: 'Acme B', values: { name: 'ACME Ltd', taxNumber: '123', email: 'b@example.com', phone: null } },
    ];
    const candidate = findDuplicateCandidates('contacts', records)[0];
    expect(candidate?.score).toBeGreaterThanOrEqual(0.45);
    expect(candidate?.reasons.some((reason) => reason.field === 'taxNumber' && reason.strength === 'exact')).toBe(true);
    expect(candidate?.mergeSupported).toBe(true);
  });

  it('blocks physical invoice merge while retaining the review candidate', () => {
    const records: DedupRecord[] = [
      { id: 'a', label: 'INV-1', values: { number: 'INV-1', contactName: 'Acme', totalGross: 100 } },
      { id: 'b', label: 'INV-1 copy', values: { number: 'INV-1', contactName: 'Acme', totalGross: 100 } },
    ];
    const candidate = findDuplicateCandidates('invoices', records)[0];
    expect(candidate?.mergeSupported).toBe(false);
    expect(candidate?.mergeBlockedReason).toContain('Yasal belgeler');
  });
});
