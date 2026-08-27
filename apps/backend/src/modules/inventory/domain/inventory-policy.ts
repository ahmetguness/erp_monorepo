import { CostingMethod } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export type NegativeStockPolicy = 'ALLOW' | 'WARN' | 'BLOCK';
export type ReservationPolicy = 'IGNORE' | 'RESPECT';
export type LotSerialPolicy = 'OPTIONAL' | 'REQUIRED' | 'REQUIRED_FOR_OUT';
export type StockCountApprovalPolicy = 'OPTIONAL' | 'REQUIRED_FOR_DIFFERENCE';

export function parseNegativeStockPolicy(value: string | null | undefined): NegativeStockPolicy | null {
  if (value === 'ALLOW' || value === 'WARN' || value === 'BLOCK') return value;
  if (value === 'true') return 'ALLOW';
  if (value === 'false') return 'BLOCK';
  return null;
}

export function parseReservationPolicy(value: string | null | undefined): ReservationPolicy | null {
  return value === 'IGNORE' || value === 'RESPECT' ? value : null;
}

export function parseLotSerialPolicy(value: string | null | undefined): LotSerialPolicy | null {
  return value === 'OPTIONAL' || value === 'REQUIRED' || value === 'REQUIRED_FOR_OUT' ? value : null;
}

export function parseStockCountApprovalPolicy(value: string | null | undefined): StockCountApprovalPolicy | null {
  return value === 'OPTIONAL' || value === 'REQUIRED_FOR_DIFFERENCE' ? value : null;
}

export function parseCostingMethod(value: string | null | undefined): CostingMethod | null {
  if (value === CostingMethod.MOVING_AVERAGE || value === CostingMethod.FIFO || value === CostingMethod.LIFO || value === CostingMethod.STANDARD) {
    return value;
  }
  return null;
}

export function quantityValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}
