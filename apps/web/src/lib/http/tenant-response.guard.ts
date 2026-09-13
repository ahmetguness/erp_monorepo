const MAX_RESPONSE_DEPTH = 32;

export class TenantResponseBoundaryError extends Error {
  readonly code = 'TENANT_RESPONSE_BOUNDARY_VIOLATION';

  constructor() {
    super('Sunucu yanitinda aktif sirket disinda bir tenant verisi algilandi.');
    this.name = 'TenantResponseBoundaryError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertTenantResponseBoundary(payload: unknown, expectedTenantId: string): void {
  const visited = new WeakSet<object>();

  function visit(value: unknown, depth: number): void {
    if (value === null || typeof value !== 'object' || depth > MAX_RESPONSE_DEPTH) return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    if (!isRecord(value)) return;
    const tenantId = value.tenantId;
    if (typeof tenantId === 'string' && tenantId !== expectedTenantId) {
      throw new TenantResponseBoundaryError();
    }
    for (const nested of Object.values(value)) visit(nested, depth + 1);
  }

  visit(payload, 0);
}
