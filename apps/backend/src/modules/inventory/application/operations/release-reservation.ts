import type { ReleaseReservationCommand } from "@repo/types";
import type { InventoryOperationRepository } from "../ports/inventory-operation.repository.js";

export class ReleaseReservation<TMovement, TReservation, TPurchaseOrder> {
  constructor(
    private readonly repository: InventoryOperationRepository<
      TMovement,
      TReservation,
      TPurchaseOrder
    >,
  ) {}

  execute(tenantId: string, command: ReleaseReservationCommand) {
    return this.repository.releaseReservation({ tenantId, ...command });
  }
}
