import { describe, expect, it } from 'vitest';
import { normalizeApiError } from '../../src/lib/http/api-error.interceptor';

describe('normalizeApiError', () => {
  it('preserves the shared API error contract', () => {
    const error = { error: { code: 'CONFLICT', message: 'Kayıt çakışıyor.', requestId: 'req-3' } };
    expect(normalizeApiError(error)).toEqual(error);
  });

  it('converts unknown errors without unsafe casts', () => {
    expect(normalizeApiError(new Error('İstemci hatası'))).toEqual({
      error: { code: 'UNKNOWN_ERROR', message: 'İstemci hatası' },
    });
  });
});
