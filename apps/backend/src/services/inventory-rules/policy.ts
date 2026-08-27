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
import {
  parseCostingMethod,
  parseLotSerialPolicy,
  parseNegativeStockPolicy,
  parseReservationPolicy,
  parseStockCountApprovalPolicy,
  quantityValue,
} from '../../modules/inventory/domain/inventory-policy.js';

export {
  parseCostingMethod,
  parseLotSerialPolicy,
  parseNegativeStockPolicy,
  parseReservationPolicy,
  parseStockCountApprovalPolicy,
  quantityValue,
} from '../../modules/inventory/domain/inventory-policy.js';

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
