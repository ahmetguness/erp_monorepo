import type { ReserveStockCommand } from "@repo/types";
import type { InventoryOperationRepository } from "../ports/inventory-operation.repository.js";

export class ReserveStock<TMovement, TReservation, TPurchaseOrder> {
  constructor(
    private readonly repository: InventoryOperationRepository<
      TMovement,
      TReservation,
      TPurchaseOrder
    >,
  ) {}

  execute(
    context: { tenantId: string; userId: string },
    command: ReserveStockCommand,
  ) {
    return this.repository.reserveStock({ ...context, ...command });
  }
}
