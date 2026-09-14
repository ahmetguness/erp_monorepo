import { describe, expect, it } from 'vitest';
import { extractAdminError } from '../../src/lib/admin/errors';

describe('extractAdminError', () => {
  it('does not repeat a generic not-found message', () => {
    expect(extractAdminError({ error: { code: 'NOT_FOUND', message: 'Kayıt bulunamadı.' } }))
      .toBe('🔍 İlgili kayıt bulunamadı.');
  });

  it('keeps a useful resource-specific not-found detail', () => {
    expect(extractAdminError({ error: { code: 'NOT_FOUND', message: 'Kupon bulunamadı.' } }))
      .toContain('Kupon bulunamadı.');
  });
});
