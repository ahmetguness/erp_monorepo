import {
  MovementRefType,
  MovementType,
  PurchaseOrderStatus,
  type InventoryReservation,
  type Prisma,
  type PrismaClient,
  type PurchaseOrder,
  type StockMovement,
} from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import {
  assertCanConsumeStock,
  assertCanReserveStock,
  getInventoryRules,
  getStockPosition,
  recordInventoryCosting,
  resolveStockLevelLocationId,
} from '../../../../services/inventory-rules.service.js';
import type {
  ConfirmGoodsReceiptInput,
  InventoryOperationRepository,
  RecordStockMovementInput,
  RecordStockMovementResult,
  ReleaseReservationInput,
  ReserveStockInput,
} from '../../application/ports/inventory-operation.repository.js';

type DbTransaction = Prisma.TransactionClient;

const purchaseOrderInclude = {
  contact: { select: { id: true, name: true } },
  items: true,
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderResult = Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>;

export class PrismaInventoryOperationRepository implements InventoryOperationRepository<
  StockMovement,
  InventoryReservation,
  PurchaseOrderResult
> {
  constructor(private readonly db: PrismaClient) {}

  async recordStockMovement(command: RecordStockMovementInput): Promise<RecordStockMovementResult<StockMovement>> {
    const existing = await this.db.stockMovement.findFirst({
      where: { tenantId: command.tenantId, idempotencyKey: command.idempotencyKey },
    });
    if (existing) {
      const sameCommand = existing.refType === MovementRefType.MANUAL
        && existing.productId === command.productId
        && (existing.fromWarehouseId === command.warehouseId || existing.toWarehouseId === command.warehouseId)
        && existing.type === command.type
        && Number(existing.quantity) === command.quantity
        && Number(existing.unitCost ?? 0) === Number(command.unitCost ?? 0)
        && (existing.lotId ?? undefined) === command.lotId
        && (existing.batchId ?? undefined) === command.batchId;
      if (!sameCommand) throw new ConflictError('idempotencyKey baska bir stok islemi icin kullanilmis.');
      return { movement: existing, replayed: true };
    }

    const [product, warehouse, rules] = await Promise.all([
      this.db.product.findFirst({ where: { id: command.productId, tenantId: command.tenantId, deletedAt: null } }),
      this.db.warehouse.findFirst({ where: { id: command.warehouseId, tenantId: command.tenantId, isActive: true } }),
      getInventoryRules(this.db, command.tenantId),
    ]);
    if (!product) throw new NotFoundError('Urun', command.productId);
    if (!warehouse) throw new NotFoundError('Depo', command.warehouseId);

    const consumption = command.type === MovementType.OUT
      ? await assertCanConsumeStock(this.db, command.tenantId, {
          productId: command.productId,
          warehouseId: command.warehouseId,
          quantity: command.quantity,
          lotId: command.lotId ?? null,
        })
      : null;

    const movement = await this.db.$transaction((tx) => this.writeMovement(tx, command));
    const updatedProduct = await this.db.product.findFirst({
      where: { id: command.productId, tenantId: command.tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        minStockLevel: true,
        stockLevels: { select: { quantity: true } },
      },
    });
    const currentQuantity = updatedProduct?.stockLevels.reduce(
      (total, level) => total + Number(level.quantity),
      0,
    ) ?? 0;
    const minStockLevel = Number(updatedProduct?.minStockLevel ?? 0);
    const lowStockSignal = updatedProduct && minStockLevel > 0 && currentQuantity <= minStockLevel
      ? {
          productId: updatedProduct.id,
          productCode: updatedProduct.code,
          productName: updatedProduct.name,
          currentQuantity,
          minStockLevel,
          warehouseId: command.warehouseId,
        }
      : undefined;
    return {
      movement,
      replayed: false,
      ...(rules.negativeStockPolicy === 'WARN' && consumption?.warning
        ? { warning: consumption.warning }
        : {}),
      ...(lowStockSignal ? { lowStockSignal } : {}),
    };
  }

  async reserveStock(command: ReserveStockInput): Promise<InventoryReservation> {
    const [product, warehouse] = await Promise.all([
      this.db.product.findFirst({ where: { id: command.productId, tenantId: command.tenantId, deletedAt: null } }),
      this.db.warehouse.findFirst({ where: { id: command.warehouseId, tenantId: command.tenantId, isActive: true } }),
    ]);
    if (!product) throw new NotFoundError('Urun', command.productId);
    if (!warehouse) throw new NotFoundError('Depo', command.warehouseId);

    return this.db.$transaction(async (tx) => {
      const position = await getStockPosition(tx, command.tenantId, command.productId, command.warehouseId, {
        refType: command.refType,
        refId: command.refId,
      });
      const quantity = command.allowPartial
        ? Math.min(command.quantity, Math.max(0, position.available))
        : command.quantity;
      if (quantity <= 0) throw new ValidationError('Kismi rezervasyon icin kullanilabilir stok yok.');
      await assertCanReserveStock(tx, command.tenantId, {
        productId: command.productId,
        warehouseId: command.warehouseId,
        quantity,
        refType: command.refType,
        refId: command.refId,
      });
      return tx.inventoryReservation.create({
        data: {
          tenantId: command.tenantId,
          productId: command.productId,
          warehouseId: command.warehouseId,
          quantity,
          refType: command.refType,
          refId: command.refId,
          notes: command.notes ?? null,
          expiresAt: command.expiresAt ? new Date(command.expiresAt) : null,
          createdById: command.userId,
        },
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });
    });
  }

  async releaseReservation(command: ReleaseReservationInput): Promise<InventoryReservation> {
    return this.db.$transaction(async (tx) => {
      const reservation = await tx.inventoryReservation.findFirst({
        where: { id: command.reservationId, tenantId: command.tenantId },
      });
      if (!reservation) throw new NotFoundError('Rezervasyon', command.reservationId);
      if (reservation.releasedAt) return reservation;
      return tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { releasedAt: new Date() },
      });
    });
  }

  async confirmGoodsReceipt(command: ConfirmGoodsReceiptInput): Promise<PurchaseOrderResult> {
    return this.db.$transaction(async (tx) => {
      const replay = await tx.stockMovement.findFirst({
        where: { tenantId: command.tenantId, idempotencyKey: command.idempotencyKey },
      });
      if (replay) {
        if (replay.refType !== MovementRefType.PURCHASE_ORDER || replay.refId !== command.purchaseOrderId) {
          throw new ConflictError('idempotencyKey baska bir stok islemi icin kullanilmis.');
        }
        return this.findPurchaseOrder(tx, command.tenantId, command.purchaseOrderId);
      }

      const [order, warehouse] = await Promise.all([
        tx.purchaseOrder.findFirst({
          where: { id: command.purchaseOrderId, tenantId: command.tenantId, deletedAt: null },
          include: { items: true },
        }),
        tx.warehouse.findFirst({
          where: { id: command.warehouseId, tenantId: command.tenantId, isActive: true },
        }),
      ]);
      if (!order) throw new NotFoundError('Satin alma siparisi', command.purchaseOrderId);
      if (!warehouse) throw new NotFoundError('Depo', command.warehouseId);
      if (order.status !== PurchaseOrderStatus.SENT && order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
        throw new ValidationError('Sadece gonderilmis veya kismi teslim alinmis siparisler teslim alinabilir.');
      }

      for (const [index, line] of command.items.entries()) {
        const orderItem = order.items.find((item) => item.id === line.itemId);
        if (!orderItem) throw new ValidationError(`Sipariste bulunmayan teslim kalemi: ${line.itemId}`);
        if (Number(orderItem.received) + line.receivedQty > Number(orderItem.quantity)) {
          throw new ValidationError(`Teslim miktari siparis miktarini asamaz: ${line.itemId}`);
        }
        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: { received: { increment: line.receivedQty } },
        });
        await this.writeReceiptMovement(tx, command, order.number, orderItem, line.receivedQty, index);
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { tenantId: command.tenantId, orderId: order.id },
      });
      const status = updatedItems.every((item) => Number(item.received) >= Number(item.quantity))
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
      await tx.purchaseOrderHistory.create({
        data: {
          tenantId: command.tenantId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: status,
          notes: `${command.items.length} kalem teslim alindi`,
          createdById: command.userId,
        },
      });
      return this.findPurchaseOrder(tx, command.tenantId, order.id);
    });
  }

  private async writeMovement(tx: DbTransaction, command: RecordStockMovementInput): Promise<StockMovement> {
    const level = await tx.stockLevel.findFirst({
      where: { tenantId: command.tenantId, productId: command.productId, warehouseId: command.warehouseId },
    });
    const previousQuantity = Number(level?.quantity ?? 0);
    const resultingQuantity = command.type === MovementType.ADJUSTMENT
      ? command.quantity
      : previousQuantity + (command.type === MovementType.OUT ? -command.quantity : command.quantity);
    const locationId = await resolveStockLevelLocationId(tx, command.tenantId, command.warehouseId, level?.locationId);
    const movement = await tx.stockMovement.create({
      data: {
        tenantId: command.tenantId,
        productId: command.productId,
        type: command.type,
        quantity: command.quantity,
        unitCost: command.unitCost ?? null,
        lotId: command.lotId ?? null,
        batchId: command.batchId ?? null,
        fromWarehouseId: command.type === MovementType.OUT ? command.warehouseId : null,
        toWarehouseId: command.type === MovementType.OUT ? null : command.warehouseId,
        refType: MovementRefType.MANUAL,
        notes: command.notes ?? null,
        createdById: command.userId,
        idempotencyKey: command.idempotencyKey,
      },
    });
    await tx.stockLevel.upsert({
      where: { productId_warehouseId_locationId: { productId: command.productId, warehouseId: command.warehouseId, locationId } },
      create: { tenantId: command.tenantId, productId: command.productId, warehouseId: command.warehouseId, locationId, quantity: resultingQuantity },
      update: command.type === MovementType.ADJUSTMENT
        ? { quantity: command.quantity }
        : command.type === MovementType.OUT
          ? { quantity: { decrement: command.quantity } }
          : { quantity: { increment: command.quantity } },
    });
    await recordInventoryCosting(tx, command.tenantId, {
      movementId: movement.id,
      productId: command.productId,
      warehouseId: command.warehouseId,
      type: command.type,
      quantity: command.quantity,
      previousQuantity,
      quantityChange: resultingQuantity - previousQuantity,
      resultingQuantity,
      unitCost: command.unitCost ?? null,
      date: movement.createdAt,
    });
    return movement;
  }

  private async writeReceiptMovement(
    tx: DbTransaction,
    command: ConfirmGoodsReceiptInput,
    orderNumber: string,
    item: { id: string; productId: string; unitPrice: Prisma.Decimal },
    quantity: number,
    index: number,
  ): Promise<void> {
    const level = await tx.stockLevel.findFirst({
      where: { tenantId: command.tenantId, productId: item.productId, warehouseId: command.warehouseId },
    });
    const previousQuantity = Number(level?.quantity ?? 0);
    const locationId = await resolveStockLevelLocationId(tx, command.tenantId, command.warehouseId, level?.locationId);
    const movement = await tx.stockMovement.create({
      data: {
        tenantId: command.tenantId,
        productId: item.productId,
        type: MovementType.IN,
        quantity,
        unitCost: item.unitPrice,
        toWarehouseId: command.warehouseId,
        refType: MovementRefType.PURCHASE_ORDER,
        refId: command.purchaseOrderId,
        notes: `Satin alma teslimi: ${orderNumber}`,
        createdById: command.userId,
        idempotencyKey: index === 0 ? command.idempotencyKey : `${command.idempotencyKey}:${item.id}`,
      },
    });
    await tx.stockLevel.upsert({
      where: { productId_warehouseId_locationId: { productId: item.productId, warehouseId: command.warehouseId, locationId } },
      create: { tenantId: command.tenantId, productId: item.productId, warehouseId: command.warehouseId, locationId, quantity },
      update: { quantity: { increment: quantity } },
    });
    await recordInventoryCosting(tx, command.tenantId, {
      movementId: movement.id,
      productId: item.productId,
      warehouseId: command.warehouseId,
      type: MovementType.IN,
      quantity,
      previousQuantity,
      quantityChange: quantity,
      resultingQuantity: previousQuantity + quantity,
      unitCost: Number(item.unitPrice),
      date: movement.createdAt,
    });
  }

  private async findPurchaseOrder(tx: DbTransaction, tenantId: string, id: string): Promise<PurchaseOrderResult> {
    const order = await tx.purchaseOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: purchaseOrderInclude,
    });
    if (!order) throw new NotFoundError('Satin alma siparisi', id);
    return order;
  }
}
