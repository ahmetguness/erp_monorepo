import { CostingMethod } from '@prisma/client';
import {
  NEGATIVE_STOCK_POLICY_KEY,
  LEGACY_NEGATIVE_STOCK_KEY,
  RESERVATION_POLICY_KEY,
  LOT_SERIAL_POLICY_KEY,
  STOCK_COUNT_APPROVAL_POLICY_KEY,
  COSTING_METHOD_KEY,
} from './types.js';
import type { InventoryDbClient, InventoryRules } from './types.js';
import {
  parseCostingMethod,
  parseLotSerialPolicy,
  parseNegativeStockPolicy,
  parseReservationPolicy,
  parseStockCountApprovalPolicy,
} from '../../modules/inventory/domain/index.js';

export {
  parseCostingMethod,
  parseLotSerialPolicy,
  parseNegativeStockPolicy,
  parseReservationPolicy,
  parseStockCountApprovalPolicy,
  quantityValue,
} from '../../modules/inventory/domain/index.js';

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
