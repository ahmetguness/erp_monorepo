import type {
  ConfirmGoodsReceiptCommand,
  RecordStockMovementCommand,
  ReleaseReservationCommand,
  ReserveStockCommand,
} from "@repo/types";
import type { LowStockSignal } from "./stock-movement-write.repository.js";

export interface InventoryOperationContext {
  tenantId: string;
  userId: string;
}

export type RecordStockMovementInput = RecordStockMovementCommand &
  InventoryOperationContext;
export type ReserveStockInput = ReserveStockCommand & InventoryOperationContext;
export type ReleaseReservationInput = ReleaseReservationCommand &
  Pick<InventoryOperationContext, "tenantId">;
export type ConfirmGoodsReceiptInput = ConfirmGoodsReceiptCommand &
  InventoryOperationContext;

export interface RecordStockMovementResult<TMovement> {
  movement: TMovement;
  replayed: boolean;
  warning?: string;
  lowStockSignal?: LowStockSignal;
}

export interface InventoryOperationRepository<
  TMovement,
  TReservation,
  TPurchaseOrder,
> {
  recordStockMovement(
    command: RecordStockMovementInput,
  ): Promise<RecordStockMovementResult<TMovement>>;
  reserveStock(command: ReserveStockInput): Promise<TReservation>;
  releaseReservation(command: ReleaseReservationInput): Promise<TReservation>;
  confirmGoodsReceipt(
    command: ConfirmGoodsReceiptInput,
  ): Promise<TPurchaseOrder>;
}
