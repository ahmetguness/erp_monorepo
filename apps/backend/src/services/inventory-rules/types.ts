import { CostingMethod, MovementType, Prisma, DeliveryNoteStatus, ReservationRefType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../errors';
import { generateDocumentNumber } from '../../utils/generate-number.js';

export type InventoryDbClient = PrismaClient | Prisma.TransactionClient;

export type NegativeStockPolicy = 'ALLOW' | 'WARN' | 'BLOCK';
export type ReservationPolicy = 'IGNORE' | 'RESPECT';
export type LotSerialPolicy = 'OPTIONAL' | 'REQUIRED' | 'REQUIRED_FOR_OUT';
export type StockCountApprovalPolicy = 'OPTIONAL' | 'REQUIRED_FOR_DIFFERENCE';

export interface InventoryRules {
  negativeStockPolicy: NegativeStockPolicy;
  reservationPolicy: ReservationPolicy;
  lotSerialPolicy: LotSerialPolicy;
  stockCountApprovalPolicy: StockCountApprovalPolicy;
  defaultCostingMethod: CostingMethod;
}

export interface StockPosition {
  onHand: number;
  reserved: number;
  available: number;
}

export interface StockConsumptionCheck {
  position: StockPosition;
  warning: string | null;
}

export interface StockReorderSuggestion {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  minStockLevel: number;
  suggestedQuantity: number;
  estimatedDaysToStockout: number | null;
  unitCost: number;
  estimatedCost: number;
}

export type SuggestionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SalesVelocity {
  daily30: number;
  daily60: number;
  daily90: number;
  trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
}

export interface AdvancedStockSuggestion {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  minStockLevel: number;
  suggestedQuantity: number;
  estimatedDaysToStockout: number | null;
  unitCost: number;
  estimatedCost: number;
  salesVelocity: SalesVelocity;
  reservationCount: number;
  pendingReservationQty: number;
  priority: SuggestionPriority;
  coverageDays: number | null;
}

export const NEGATIVE_STOCK_POLICY_KEY = 'negative_stock_policy';
export const LEGACY_NEGATIVE_STOCK_KEY = 'negative_stock';
export const RESERVATION_POLICY_KEY = 'reservation_policy';
export const LOT_SERIAL_POLICY_KEY = 'lot_serial_policy';
export const STOCK_COUNT_APPROVAL_POLICY_KEY = 'stock_count_approval_policy';
export const COSTING_METHOD_KEY = 'costing_method';
export const DEFAULT_STOCK_LOCATION_CODE = '__DEFAULT__';
