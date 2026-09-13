import type { CreateWorkOrderCommand } from '@repo/types';
import { ValidationError } from '../../../../errors/index.js';
import { requirePositiveQuantity } from '../../domain/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${field} metin olmalıdır.`);
  return value;
}

export function validateCreateWorkOrder(value: unknown): CreateWorkOrderCommand {
  if (!isRecord(value) || typeof value.productId !== 'string' || !value.productId.trim()) throw new ValidationError('productId zorunludur.');
  if (typeof value.plannedQty !== 'number') throw new ValidationError('plannedQty sayı olmalıdır.');
  const command: CreateWorkOrderCommand = {
    productId: value.productId,
    plannedQty: value.plannedQty,
    bomId: optionalString(value.bomId, 'bomId'),
    startDate: optionalString(value.startDate, 'startDate'),
    endDate: optionalString(value.endDate, 'endDate'),
    notes: optionalString(value.notes, 'notes'),
    inputWarehouseId: optionalString(value.inputWarehouseId, 'inputWarehouseId'),
    outputWarehouseId: optionalString(value.outputWarehouseId, 'outputWarehouseId'),
  };
  requirePositiveQuantity(command.plannedQty, 'plannedQty');
  for (const [label, value] of [['startDate', command.startDate], ['endDate', command.endDate]] as const) {
    if (value && Number.isNaN(new Date(value).getTime())) throw new ValidationError(`${label} geçerli bir tarih olmalıdır.`);
  }
  if (command.startDate && command.endDate && new Date(command.endDate) < new Date(command.startDate)) {
    throw new ValidationError('endDate, startDate tarihinden önce olamaz.');
  }
  return command;
}
