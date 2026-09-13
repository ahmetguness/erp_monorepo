import type { MaterialConsumptionCommand } from '@repo/types';
import { ValidationError } from '../../../../errors/index.js';
import { requirePositiveQuantity } from '../../domain/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateMaterialConsumption(value: unknown): MaterialConsumptionCommand {
  if (!isRecord(value) || typeof value.itemId !== 'string' || !value.itemId.trim()) {
    throw new ValidationError('consumption.itemId zorunludur.');
  }
  if (typeof value.quantity !== 'number') throw new ValidationError('consumption.quantity sayı olmalıdır.');
  requirePositiveQuantity(value.quantity, 'consumption.quantity');
  return { itemId: value.itemId, quantity: value.quantity };
}
