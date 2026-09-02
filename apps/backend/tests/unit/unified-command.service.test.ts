import { describe, expect, it, vi } from 'vitest';
import type { UnifiedPermissionPort, UnifiedSearchPort } from '../../src/modules/platform/application/unified-command/unified-command.ports.js';
import { UnifiedCommandService } from '../../src/modules/platform/application/unified-command/unified-command.service.js';
import type { UnifiedSearchResult } from '../../src/modules/platform/application/unified-command/unified-command.types.js';

const actionResult: UnifiedSearchResult = {
  id: 'new-quote',
  type: 'action',
  kind: 'action',
  module: 'invoicing',
  title: 'Yeni teklif',
  subtitle: null,
  href: '/dashboard/sales-orders/quotes/new',
  status: null,
  date: null,
  amount: null,
  meta: [],
};

function createService(options: { hasTenant?: boolean; canCreate?: boolean } = {}) {
  const search = vi.fn(async () => [actionResult]);
  const getContext = vi.fn(async () => options.hasTenant === false ? null : ({
    can(action: 'READ' | 'CREATE', module: string) {
      return action === 'CREATE' && module === 'invoicing' && options.canCreate !== false;
    },
  }));
  const searchPort: UnifiedSearchPort = { search };
  const permissionPort: UnifiedPermissionPort = { getContext };
  return { service: new UnifiedCommandService(searchPort, permissionPort), search, getContext };
}

const baseInput = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  query: 'ABC için yeni teklif oluştur',
  limit: 12,
  recentHrefs: ['/dashboard/sales-orders/quotes/new'],
};

describe('unified command service', () => {
  it('combines tenant search, contextual shortcuts and a permission-gated intent', async () => {
    const { service } = createService();
    const response = await service.preview(baseInput);

    expect('kind' in response).toBe(false);
    if ('kind' in response) return;
    expect(response.mode).toBe('COMMAND');
    expect(response.intent?.id).toBe('CREATE_SALES_QUOTE');
    expect(response.contextualShortcuts).toEqual([actionResult]);
  });

  it('stops before search when the user has no tenant membership', async () => {
    const { service, search } = createService({ hasTenant: false });
    await expect(service.preview(baseInput)).resolves.toMatchObject({ kind: 'FORBIDDEN' });
    expect(search).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and rechecks permission', async () => {
    const denied = createService({ canCreate: false }).service;
    await expect(denied.confirm({ ...baseInput, intentId: 'CREATE_SALES_QUOTE', selectedOptionId: null, confirmed: true }))
      .resolves.toMatchObject({ kind: 'VALIDATION' });

    const allowed = createService().service;
    await expect(allowed.confirm({ ...baseInput, intentId: 'CREATE_SALES_QUOTE', selectedOptionId: null, confirmed: false }))
      .resolves.toMatchObject({ kind: 'VALIDATION' });
  });

  it('returns a non-mutating handoff only after confirmation', async () => {
    const { service } = createService();
    const response = await service.confirm({ ...baseInput, intentId: 'CREATE_SALES_QUOTE', selectedOptionId: null, confirmed: true });
    expect(response).toMatchObject({ intentId: 'CREATE_SALES_QUOTE', mutationExecuted: false });
    expect('href' in response && response.href).toContain('command=');
  });
});
