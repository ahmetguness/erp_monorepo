import { describe, expect, it } from 'vitest';

import {
  assertTenantResponseBoundary,
  TenantResponseBoundaryError,
} from '@/lib/http/tenant-response.guard';

describe('tenant response boundary', () => {
  it('accepts nested records that belong to the active tenant', () => {
    expect(() =>
      assertTenantResponseBoundary(
        {
          tenantId: 'tenant-a',
          lines: [{ product: { tenantId: 'tenant-a' } }],
        },
        'tenant-a',
      ),
    ).not.toThrow();
  });

  it('rejects a foreign tenant in a nested relation', () => {
    expect(() =>
      assertTenantResponseBoundary(
        {
          tenantId: 'tenant-a',
          lines: [{ product: { tenantId: 'tenant-b' } }],
        },
        'tenant-a',
      ),
    ).toThrow(TenantResponseBoundaryError);
  });

  it('handles cyclic response objects without weakening validation', () => {
    const payload: Record<string, unknown> = { tenantId: 'tenant-a' };
    payload.self = payload;

    expect(() => assertTenantResponseBoundary(payload, 'tenant-a')).not.toThrow();
  });
});
