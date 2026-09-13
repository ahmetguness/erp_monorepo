export const INVENTORY_MOVEMENT_TYPES = [
  "IN",
  "OUT",
  "TRANSFER",
  "ADJUSTMENT",
  "RETURN",
  "OPENING",
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const MANUAL_INVENTORY_MOVEMENT_TYPES = [
  "IN",
  "OUT",
  "ADJUSTMENT",
  "OPENING",
] as const;

export type ManualInventoryMovementType =
  (typeof MANUAL_INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_RESERVATION_REF_TYPES = [
  "SALES_ORDER",
  "WORK_ORDER",
  "PURCHASE_REQUEST",
  "OTHER",
] as const;

export type InventoryReservationRefType =
  (typeof INVENTORY_RESERVATION_REF_TYPES)[number];

export interface RecordStockMovementCommand {
  idempotencyKey: string;
  productId: string;
  warehouseId: string;
  type: ManualInventoryMovementType;
  quantity: number;
  unitCost?: number;
  lotId?: string;
  batchId?: string;
  notes?: string;
}

export interface ReserveStockCommand {
  productId: string;
  warehouseId: string;
  quantity: number;
  refType: InventoryReservationRefType;
  refId: string;
  notes?: string;
  expiresAt?: string;
  allowPartial?: boolean;
}

export interface ReleaseReservationCommand {
  reservationId: string;
}

export interface GoodsReceiptLineCommand {
  itemId: string;
  receivedQty: number;
}

export interface ConfirmGoodsReceiptCommand {
  purchaseOrderId: string;
  warehouseId: string;
  idempotencyKey: string;
  items: GoodsReceiptLineCommand[];
}
