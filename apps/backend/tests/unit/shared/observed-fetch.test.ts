import { afterEach, describe, expect, it, vi } from 'vitest';
import { observedFetch } from '../../../src/modules/shared/index.js';
import { runWithObservabilityContext } from '../../../src/services/observability.service.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('observedFetch', () => {
  it('propagates W3C trace and correlation headers without tenant identifiers', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('traceparent')).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
      expect(headers.get('x-correlation-id')).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(headers.has('x-tenant-id')).toBe(false);
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await runWithObservabilityContext(
      { requestId: 'request-1', correlationId: '123e4567-e89b-12d3-a456-426614174000' },
      () => observedFetch('https://example.com/resource'),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
