import { CostingMethod, MovementType, Prisma, DeliveryNoteStatus, ReservationRefType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../errors';
import { generateDocumentNumber } from '../../utils/generate-number.js';
import { NEGATIVE_STOCK_POLICY_KEY, LEGACY_NEGATIVE_STOCK_KEY, RESERVATION_POLICY_KEY, LOT_SERIAL_POLICY_KEY, STOCK_COUNT_APPROVAL_POLICY_KEY, COSTING_METHOD_KEY, DEFAULT_STOCK_LOCATION_CODE } from './types.js';
import type { InventoryDbClient, NegativeStockPolicy, ReservationPolicy, LotSerialPolicy, StockCountApprovalPolicy, InventoryRules, StockPosition, StockConsumptionCheck, StockReorderSuggestion, SuggestionPriority, SalesVelocity, AdvancedStockSuggestion } from './types.js';
import { getInventoryRules } from './policy.js';
import { resolveStockLevelLocationId, assertCanConsumeStock, releaseInventoryReservations } from './availability.js';
import { recordInventoryCosting } from './costing.js';

export async function processDeliveryNoteStock(
  db: InventoryDbClient,
  tenantId: string,
  deliveryNoteId: string,
): Promise<void> {
  const note = await db.deliveryNote.findFirst({
    where: { id: deliveryNoteId, tenantId },
    include: { items: { include: { product: true } } },
  });
  if (!note) return;

  const activeStatuses: DeliveryNoteStatus[] = ['CONFIRMED', 'SHIPPED', 'DELIVERED'];
  if (!activeStatuses.includes(note.status)) return;

  const existingMovements = await db.stockMovement.findFirst({
    where: { tenantId, refType: 'DELIVERY_NOTE', refId: deliveryNoteId },
  });
  if (existingMovements) return;

  const isOutbound = note.type === 'OUTBOUND' || (note.type === 'RETURN' && note.purchaseOrderId !== null);
  const isInbound = note.type === 'INBOUND' || (note.type === 'RETURN' && note.salesOrderId !== null);

  const mType = isOutbound
    ? (note.type === 'RETURN' ? MovementType.RETURN : MovementType.OUT)
    : (note.type === 'RETURN' ? MovementType.RETURN : MovementType.IN);

  for (const item of note.items) {
    const qty = Number(item.deliveredQty);
    if (qty <= 0) continue;

    const warehouseId = note.warehouseId;
    const existingLevel = await db.stockLevel.findFirst({
      where: { tenantId, productId: item.productId, warehouseId },
    });
    const previousQuantity = Number(existingLevel?.quantity ?? 0);
    const locId = await resolveStockLevelLocationId(db, tenantId, warehouseId, item.locationId ?? existingLevel?.locationId);

    if (isOutbound) {
      await assertCanConsumeStock(db, tenantId, {
        productId: item.productId,
        warehouseId,
        quantity: qty,
        lotId: item.lotId,
        refType: 'DELIVERY_NOTE',
        refId: deliveryNoteId,
      });
    } else {
      const rules = await getInventoryRules(db, tenantId);
      if (rules.lotSerialPolicy === 'REQUIRED' && !item.lotId) {
        throw new ValidationError('Lot/seri bilgisi zorunludur.');
      }
    }

    const movement = await db.stockMovement.create({
      data: {
        tenantId,
        productId: item.productId,
        type: mType,
        quantity: qty,
        lotId: item.lotId ?? null,
        batchId: item.batchId ?? null,
        fromWarehouseId: isOutbound ? warehouseId : null,
        toWarehouseId: isInbound ? warehouseId : null,
        refType: 'DELIVERY_NOTE',
        refId: deliveryNoteId,
        notes: `İrsaliye: ${note.number}`,
      },
    });

    const qtyChange = isOutbound ? -qty : qty;
    await db.stockLevel.upsert({
      where: {
        productId_warehouseId_locationId: {
          productId: item.productId,
          warehouseId,
          locationId: locId,
        },
      },
      create: {
        tenantId,
        productId: item.productId,
        warehouseId,
        locationId: locId,
        quantity: qtyChange,
      },
      update: { quantity: { increment: qtyChange } },
    });

    await recordInventoryCosting(db, tenantId, {
      movementId: movement.id,
      productId: item.productId,
      warehouseId,
      type: mType,
      quantity: qty,
      previousQuantity,
      quantityChange: qtyChange,
      resultingQuantity: previousQuantity + qtyChange,
      date: movement.createdAt,
    });
  }

  if (note.salesOrderId && isOutbound) {
    await releaseInventoryReservations(db, tenantId, {
      refType: ReservationRefType.SALES_ORDER,
      refId: note.salesOrderId,
    });
  }
}
