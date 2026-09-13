import type { RecordProductionOutputCommand } from '@repo/types';
import { ValidationError } from '../../../../errors/index.js';
import { requirePositiveQuantity } from '../../domain/index.js';
import { validateMaterialConsumption } from './consume-material.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateProductionOutput(value: unknown): RecordProductionOutputCommand {
  if (!isRecord(value) || typeof value.producedQty !== 'number') throw new ValidationError('producedQty sayı olmalıdır.');
  if (value.scrapQty !== undefined && typeof value.scrapQty !== 'number') throw new ValidationError('scrapQty sayı olmalıdır.');
  if (value.consumptions !== undefined && !Array.isArray(value.consumptions)) throw new ValidationError('consumptions liste olmalıdır.');
  const command: RecordProductionOutputCommand = {
    producedQty: value.producedQty,
    ...(typeof value.scrapQty === 'number' ? { scrapQty: value.scrapQty } : {}),
    ...(typeof value.scrapReason === 'string' ? { scrapReason: value.scrapReason } : {}),
    ...(typeof value.operationId === 'string' ? { operationId: value.operationId } : {}),
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    ...(Array.isArray(value.consumptions) ? { consumptions: value.consumptions.map(validateMaterialConsumption) } : {}),
  };
  requirePositiveQuantity(command.producedQty, 'producedQty');
  if (command.scrapQty !== undefined && (!Number.isFinite(command.scrapQty) || command.scrapQty < 0)) {
    throw new ValidationError('scrapQty negatif olamaz.');
  }
  const itemIds = command.consumptions?.map((item) => item.itemId) ?? [];
  if (new Set(itemIds).size !== itemIds.length) throw new ValidationError('Aynı malzeme kalemi birden fazla kez gönderilemez.');
  return command;
}
