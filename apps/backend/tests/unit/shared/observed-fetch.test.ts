import { afterEach, describe, expect, it, vi } from 'vitest';
import { observedFetch } from '../../../src/modules/shared/index.js';
import { runWithObservabilityContext } from '../../../src/services/observability.service.js';
import { withSpan } from '../../../src/lib/telemetry/tracing.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('observedFetch', () => {
  it('replaces Request headers when init.headers is supplied, including an empty set', async () => {
    const original = new Request('https://provider.example.test/resource', { headers: { authorization: 'Bearer synthetic-original', 'x-original': 'synthetic-value' } });
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('x-original')).toBe(false);
      return new Response('{}');
    });
    vi.stubGlobal('fetch', fetchMock);
    const replacements: HeadersInit[] = [{ accept: 'application/json' }, new Headers()];
    for (const headers of replacements) await observedFetch(original, { headers });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves Request headers when no init.headers override is supplied', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-original');
      return new Response('{}');
    }));
    await observedFetch(new Request('https://provider.example.test/resource', { headers: { authorization: 'Bearer synthetic-original' } }));
  });

  it('propagates W3C trace and correlation headers without tenant identifiers', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('traceparent')).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
      expect(headers.get('traceparent')?.split('-')[1]).toBe('a'.repeat(32));
      expect(headers.get('x-correlation-id')).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(headers.has('x-tenant-id')).toBe(false);
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await withSpan('test.request', 2, {}, () => runWithObservabilityContext(
      { requestId: 'request-1', correlationId: '123e4567-e89b-12d3-a456-426614174000' },
      () => observedFetch('https://example.com/resource'),
    ), `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
