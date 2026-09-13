import { describe, expect, it, vi } from 'vitest';

import { CreateManualStockMovement } from '../../../src/modules/inventory/application/operations/index.js';
import type {
  CreateManualStockMovementCommand,
  StockMovementWriteRepository,
} from '../../../src/modules/inventory/application/ports/stock-movement-write.repository.js';

interface TestMovement {
  id: string;
  type: string;
}

function createRepository() {
  const createManual = vi.fn(async (command: CreateManualStockMovementCommand) => ({
    movement: { id: 'movement-1', type: command.type },
  }));
  const repository: StockMovementWriteRepository<TestMovement> = { createManual };
  return { createManual, repository };
}

describe('CreateManualStockMovement', () => {
  const validInput = {
    tenantId: 'tenant-1',
    productId: 'product-1',
    warehouseId: 'warehouse-1',
    type: 'IN',
    quantity: 2,
  } as const;

  it('delegates a validated command to the atomic write port', async () => {
    const { createManual, repository } = createRepository();
    const result = await new CreateManualStockMovement(repository).execute(validInput);

    expect(result.movement).toEqual({ id: 'movement-1', type: 'IN' });
    expect(createManual).toHaveBeenCalledWith(validInput);
  });

  it('rejects unsupported movement types before persistence', async () => {
    const { createManual, repository } = createRepository();
    const operation = new CreateManualStockMovement(repository);

    expect(() => operation.execute({ ...validInput, type: 'TRANSFER' })).toThrow();
    expect(createManual).not.toHaveBeenCalled();
  });

  it('rejects non-positive quantities before persistence', async () => {
    const { createManual, repository } = createRepository();
    const operation = new CreateManualStockMovement(repository);

    expect(() => operation.execute({ ...validInput, quantity: 0 })).toThrow();
    expect(createManual).not.toHaveBeenCalled();
  });
});
