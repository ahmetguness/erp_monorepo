import { describe, expect, it } from 'vitest';
import { normalizeApiError } from '../../src/lib/http/api-error.interceptor';
import axios from 'axios';

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

  it('preserves a rate-limit response for safe UI feedback', () => {
    const error = new axios.AxiosError('rate limited', 'ERR_BAD_RESPONSE', undefined, undefined, {
      data: { error: { code: 'RATE_LIMITED', message: 'Biraz sonra tekrar deneyin.', details: { retryAfterSeconds: 60 } } },
      status: 429,
      statusText: 'Too Many Requests',
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    });
    expect(normalizeApiError(error)).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Biraz sonra tekrar deneyin.', details: { retryAfterSeconds: 60 } },
    });
  });
});
