import { describe, expect, it } from 'vitest';
import { OperationRecoveryService, type OperationRecoveryRepository } from '../../src/modules/recovery/application/index.js';

function repository(createdAt: Date, recoveredAt: Date | null = null): OperationRecoveryRepository {
  return {
    recordExists: async () => true,
    listCandidates: async () => [{ id: 'audit-1', action: 'UPDATE', entityType: 'CONTACT', entityId: 'contact-1', oldValues: { name: 'Önce' }, newValues: { name: 'Sonra' }, createdAt, recoveredAt }],
    getImpacts: async () => [{ label: 'Fatura', count: 2 }],
    restoreContact: async () => undefined,
  };
}

const context = { tenantId: 'tenant-1', userId: 'user-1', entityType: 'CONTACT' as const, entityId: 'contact-1' };

describe('operation recovery', () => {
  it('exposes understandable change and dependency impact inside undo window', async () => {
    const service = new OperationRecoveryService(repository(new Date()));
    const [item] = await service.list(context);
    expect(item).toMatchObject({ mode: 'UNDO', canExecute: true, impacts: [{ label: 'Fatura', count: 2 }] });
    expect(item?.changes).toEqual([{ field: 'name', label: 'Unvan', before: 'Önce', after: 'Sonra' }]);
  });

  it('closes expired undo windows', async () => {
    const service = new OperationRecoveryService(repository(new Date(Date.now() - 16 * 60 * 1000)));
    const [item] = await service.list(context);
    expect(item?.canExecute).toBe(false);
    await expect(service.undo(context, 'audit-1')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
