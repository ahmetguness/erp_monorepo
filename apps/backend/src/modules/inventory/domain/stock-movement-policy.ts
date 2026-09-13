import { ValidationError } from '../../../errors/index.js';

export const MANUAL_STOCK_MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUSTMENT', 'OPENING'] as const;
export type ManualStockMovementType = (typeof MANUAL_STOCK_MOVEMENT_TYPES)[number];

export function isManualStockMovementType(value: string): value is ManualStockMovementType {
  return (MANUAL_STOCK_MOVEMENT_TYPES as readonly string[]).includes(value);
}

export function assertManualStockMovement(type: string, quantity: number): asserts type is ManualStockMovementType {
  if (!isManualStockMovementType(type)) {
    throw new ValidationError(`Manuel hareket için geçerli tipler: ${MANUAL_STOCK_MOVEMENT_TYPES.join(', ')}`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ValidationError("Miktar 0'dan büyük olmalıdır.");
  }
}
