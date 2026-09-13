import { WorkOrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  decideWorkOrderCompletion,
  validateCreateWorkOrder,
  validateProductionOutput,
} from '../../../src/modules/production/application/operations/index.js';

describe('production application operations', () => {
  it('validates create-work-order dates and quantity', () => {
    expect(validateCreateWorkOrder({ productId: 'p-1', plannedQty: 2 })).toEqual({ productId: 'p-1', plannedQty: 2 });
    expect(() => validateCreateWorkOrder({ productId: 'p-1', plannedQty: 0 })).toThrow();
    expect(() => validateCreateWorkOrder({ productId: 'p-1', plannedQty: 1, startDate: '2026-02-02', endDate: '2026-01-01' })).toThrow();
    expect(() => validateCreateWorkOrder(null)).toThrow();
  });

  it('rejects duplicate or invalid material consumptions', () => {
    expect(() => validateProductionOutput({ producedQty: 1, consumptions: [{ itemId: 'i-1', quantity: 1 }, { itemId: 'i-1', quantity: 1 }] })).toThrow();
    expect(() => validateProductionOutput({ producedQty: 1, consumptions: [{ itemId: 'i-1', quantity: -1 }] })).toThrow();
    expect(() => validateProductionOutput(null)).toThrow();
  });

  it('makes completion retries explicit and idempotent', () => {
    expect(decideWorkOrderCompletion(WorkOrderStatus.COMPLETED)).toBe('ALREADY_COMPLETED');
    expect(decideWorkOrderCompletion(WorkOrderStatus.IN_PROGRESS)).toBe('COMPLETE');
  });
});
