import type { RecordStockMovementCommand } from "@repo/types";
import type { InventoryOperationRepository } from "../ports/inventory-operation.repository.js";

export class RecordStockMovement<TMovement, TReservation, TPurchaseOrder> {
  constructor(
    private readonly repository: InventoryOperationRepository<
      TMovement,
      TReservation,
      TPurchaseOrder
    >,
  ) {}

  execute(
    context: { tenantId: string; userId: string },
    command: RecordStockMovementCommand,
  ) {
    return this.repository.recordStockMovement({ ...context, ...command });
  }
}
