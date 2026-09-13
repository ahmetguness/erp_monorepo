import type { ManualStockMovementType } from "../../domain/index.js";

export interface CreateManualStockMovementCommand {
  tenantId: string;
  productId: string;
  warehouseId: string;
  type: ManualStockMovementType;
  quantity: number;
  unitCost?: number;
  lotId?: string;
  batchId?: string;
  notes?: string;
}

export interface LowStockSignal {
  productId: string;
  productCode: string;
  productName: string;
  currentQuantity: number;
  minStockLevel: number;
  warehouseId: string;
}

export interface StockMovementWriteResult<TMovement> {
  movement: TMovement;
  warning?: string;
  lowStockSignal?: LowStockSignal;
}

export interface StockMovementWriteRepository<TMovement> {
  createManual(
    command: CreateManualStockMovementCommand,
  ): Promise<StockMovementWriteResult<TMovement>>;
}
