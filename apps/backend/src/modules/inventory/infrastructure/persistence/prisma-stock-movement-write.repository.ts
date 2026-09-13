import { MovementType } from "@prisma/client";
import type { PrismaClient, StockMovement } from "@prisma/client";

import {
  assertCanConsumeStock,
  getInventoryRules,
  recordInventoryCosting,
  resolveStockLevelLocationId,
} from "../../../../services/inventory-rules.service.js";
import type {
  CreateManualStockMovementCommand,
  StockMovementWriteRepository,
  StockMovementWriteResult,
} from "../../application/ports/stock-movement-write.repository.js";

export class PrismaStockMovementWriteRepository implements StockMovementWriteRepository<StockMovement> {
  constructor(private readonly db: PrismaClient) {}

  async createManual(
    command: CreateManualStockMovementCommand,
  ): Promise<StockMovementWriteResult<StockMovement>> {
    const rules = await getInventoryRules(this.db, command.tenantId);
    const consumption =
      command.type === MovementType.OUT
        ? await assertCanConsumeStock(this.db, command.tenantId, {
            productId: command.productId,
            warehouseId: command.warehouseId,
            quantity: command.quantity,
            lotId: command.lotId ?? null,
          })
        : null;

    const movement = await this.db.$transaction(async (tx) => {
      const existingLevel = await tx.stockLevel.findFirst({
        where: {
          tenantId: command.tenantId,
          productId: command.productId,
          warehouseId: command.warehouseId,
        },
      });
      const previousQuantity = Number(existingLevel?.quantity ?? 0);
      const locationId = await resolveStockLevelLocationId(
        tx,
        command.tenantId,
        command.warehouseId,
        existingLevel?.locationId,
      );
      const stockMovement = await tx.stockMovement.create({
        data: {
          tenantId: command.tenantId,
          productId: command.productId,
          type: command.type,
          quantity: command.quantity,
          unitCost: command.unitCost ?? null,
          lotId: command.lotId ?? null,
          batchId: command.batchId ?? null,
          ...(command.type === MovementType.OUT
            ? { fromWarehouseId: command.warehouseId }
            : { toWarehouseId: command.warehouseId }),
          notes: command.notes ?? null,
        },
      });
      const resultingQuantity =
        command.type === MovementType.ADJUSTMENT
          ? command.quantity
          : previousQuantity +
            (command.type === MovementType.OUT
              ? -command.quantity
              : command.quantity);

      await tx.stockLevel.upsert({
        where: {
          productId_warehouseId_locationId: {
            productId: command.productId,
            warehouseId: command.warehouseId,
            locationId,
          },
        },
        create: {
          tenantId: command.tenantId,
          productId: command.productId,
          warehouseId: command.warehouseId,
          locationId,
          quantity: resultingQuantity,
        },
        update:
          command.type === MovementType.ADJUSTMENT
            ? { quantity: command.quantity }
            : command.type === MovementType.OUT
              ? { quantity: { decrement: command.quantity } }
              : { quantity: { increment: command.quantity } },
      });
      await recordInventoryCosting(tx, command.tenantId, {
        movementId: stockMovement.id,
        productId: command.productId,
        warehouseId: command.warehouseId,
        type: command.type,
        quantity: command.quantity,
        previousQuantity,
        quantityChange: resultingQuantity - previousQuantity,
        resultingQuantity,
        unitCost: command.unitCost ?? null,
        date: stockMovement.createdAt,
      });
      return stockMovement;
    });

    const product = await this.db.product.findFirst({
      where: {
        id: command.productId,
        tenantId: command.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        minStockLevel: true,
        stockLevels: { select: { quantity: true } },
      },
    });
    const currentQuantity =
      product?.stockLevels.reduce(
        (total, level) => total + Number(level.quantity),
        0,
      ) ?? 0;
    const minStockLevel = Number(product?.minStockLevel ?? 0);
    const lowStockSignal =
      product && minStockLevel > 0 && currentQuantity <= minStockLevel
        ? {
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            currentQuantity,
            minStockLevel,
            warehouseId: command.warehouseId,
          }
        : undefined;

    return {
      movement,
      ...(rules.negativeStockPolicy === "WARN" && consumption?.warning
        ? { warning: consumption.warning }
        : {}),
      ...(lowStockSignal ? { lowStockSignal } : {}),
    };
  }
}
