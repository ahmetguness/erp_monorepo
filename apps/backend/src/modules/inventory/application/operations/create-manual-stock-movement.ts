import { assertManualStockMovement } from '../../domain/index.js';
import type { CreateManualStockMovementCommand, StockMovementWriteRepository } from '../ports/stock-movement-write.repository.js';

export type CreateManualStockMovementInput = Omit<CreateManualStockMovementCommand, 'type'> & { type: string };

export class CreateManualStockMovement<TMovement> {
  constructor(private readonly repository: StockMovementWriteRepository<TMovement>) {}

  execute(command: CreateManualStockMovementInput) {
    assertManualStockMovement(command.type, command.quantity);
    const validatedCommand: CreateManualStockMovementCommand = {
      ...command,
      type: command.type,
    };
    return this.repository.createManual(validatedCommand);
  }
}
