import type { ConfirmGoodsReceiptCommand } from "@repo/types";
import type { InventoryOperationRepository } from "../ports/inventory-operation.repository.js";

export class ConfirmGoodsReceipt<TMovement, TReservation, TPurchaseOrder> {
  constructor(
    private readonly repository: InventoryOperationRepository<
      TMovement,
      TReservation,
      TPurchaseOrder
    >,
  ) {}

  execute(
    context: { tenantId: string; userId: string },
    command: ConfirmGoodsReceiptCommand,
  ) {
    return this.repository.confirmGoodsReceipt({ ...context, ...command });
  }
}
