import { CostingMethod, MovementType, Prisma, DeliveryNoteStatus, ReservationRefType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../errors';
import { generateDocumentNumber } from '../../utils/generate-number.js';
import { NEGATIVE_STOCK_POLICY_KEY, LEGACY_NEGATIVE_STOCK_KEY, RESERVATION_POLICY_KEY, LOT_SERIAL_POLICY_KEY, STOCK_COUNT_APPROVAL_POLICY_KEY, COSTING_METHOD_KEY, DEFAULT_STOCK_LOCATION_CODE } from './types.js';
import type { InventoryDbClient, NegativeStockPolicy, ReservationPolicy, LotSerialPolicy, StockCountApprovalPolicy, InventoryRules, StockPosition, StockConsumptionCheck, StockReorderSuggestion, SuggestionPriority, SalesVelocity, AdvancedStockSuggestion } from './types.js';
import { resolveStockLevelLocationId, getStockPosition, assertCanConsumeStock, assertCanReserveStock, releaseInventoryReservations, releaseExpiredInventoryReservations, assertStockCountApproval } from './availability.js';
import { calculateLayerCost, recordInventoryCosting } from './costing.js';
import { getReorderSuggestions, determineSalesVelocityTrend, determineSuggestionPriority, getAdvancedStockSuggestions, convertReorderSuggestionsToPurchaseRequest } from './replenishment.js';
import { processDeliveryNoteStock } from './delivery.js';

export function parseNegativeStockPolicy(value: string | null | undefined): NegativeStockPolicy | null {
  if (value === 'ALLOW' || value === 'WARN' || value === 'BLOCK') return value;
  if (value === 'true') return 'ALLOW';
  if (value === 'false') return 'BLOCK';
  return null;
}

export function parseReservationPolicy(value: string | null | undefined): ReservationPolicy | null {
  if (value === 'IGNORE' || value === 'RESPECT') return value;
  return null;
}

export function parseLotSerialPolicy(value: string | null | undefined): LotSerialPolicy | null {
  if (value === 'OPTIONAL' || value === 'REQUIRED' || value === 'REQUIRED_FOR_OUT') return value;
  return null;
}

export function parseStockCountApprovalPolicy(value: string | null | undefined): StockCountApprovalPolicy | null {
  if (value === 'OPTIONAL' || value === 'REQUIRED_FOR_DIFFERENCE') return value;
  return null;
}

export function parseCostingMethod(value: string | null | undefined): CostingMethod | null {
  if (
    value === CostingMethod.MOVING_AVERAGE ||
    value === CostingMethod.FIFO ||
    value === CostingMethod.LIFO ||
    value === CostingMethod.STANDARD
  ) {
    return value;
  }
  return null;
}

export function quantityValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

export async function getInventoryRules(db: InventoryDbClient, tenantId: string): Promise<InventoryRules> {
  const settings = await db.moduleSetting.findMany({
    where: {
      tenantId,
      module: 'inventory',
      key: {
        in: [
          NEGATIVE_STOCK_POLICY_KEY,
          LEGACY_NEGATIVE_STOCK_KEY,
          RESERVATION_POLICY_KEY,
          LOT_SERIAL_POLICY_KEY,
          STOCK_COUNT_APPROVAL_POLICY_KEY,
          COSTING_METHOD_KEY,
        ],
      },
    },
    select: { key: true, value: true },
  });

  const settingValue = (key: string): string | null | undefined => settings.find((setting) => setting.key === key)?.value;

  return {
    negativeStockPolicy:
      parseNegativeStockPolicy(settingValue(NEGATIVE_STOCK_POLICY_KEY)) ??
      parseNegativeStockPolicy(settingValue(LEGACY_NEGATIVE_STOCK_KEY)) ??
      'ALLOW',
    reservationPolicy: parseReservationPolicy(settingValue(RESERVATION_POLICY_KEY)) ?? 'RESPECT',
    lotSerialPolicy: parseLotSerialPolicy(settingValue(LOT_SERIAL_POLICY_KEY)) ?? 'OPTIONAL',
    stockCountApprovalPolicy:
      parseStockCountApprovalPolicy(settingValue(STOCK_COUNT_APPROVAL_POLICY_KEY)) ?? 'OPTIONAL',
    defaultCostingMethod: parseCostingMethod(settingValue(COSTING_METHOD_KEY)) ?? CostingMethod.MOVING_AVERAGE,
  };
}
