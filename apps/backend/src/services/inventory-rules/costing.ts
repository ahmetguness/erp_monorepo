import { CostingMethod, MovementType } from '@prisma/client';
import { ValidationError } from '../../errors';
import type { InventoryDbClient } from './types.js';
import { quantityValue, getInventoryRules } from './policy.js';

export async function calculateLayerCost(
  db: InventoryDbClient,
  tenantId: string,
  productId: string,
  warehouseId: string,
  qtyRequired: number,
  method: 'FIFO' | 'LIFO',
): Promise<number> {
  const valuations = await db.stockValuation.findMany({
    where: { tenantId, productId, warehouseId },
    orderBy: [
      { date: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  const inLayers: { id: string; qty: number; initialQty: number; unitCost: number }[] = [];

  for (const v of valuations) {
    const qtyIn = Number(v.qtyIn);
    const qtyOut = Number(v.qtyOut);

    if (qtyIn > 0) {
      inLayers.push({
        id: v.id,
        qty: qtyIn,
        initialQty: qtyIn,
        unitCost: Number(v.unitCost),
      });
    }

    if (qtyOut > 0) {
      let remainingOut = qtyOut;
      if (method === 'FIFO') {
        for (const layer of inLayers) {
          if (layer.qty > 0) {
            const consume = Math.min(layer.qty, remainingOut);
            layer.qty -= consume;
            remainingOut -= consume;
            if (remainingOut <= 0) break;
          }
        }
      } else {
        for (let i = inLayers.length - 1; i >= 0; i--) {
          const layer = inLayers[i];
          if (layer.qty > 0) {
            const consume = Math.min(layer.qty, remainingOut);
            layer.qty -= consume;
            remainingOut -= consume;
            if (remainingOut <= 0) break;
          }
        }
      }
    }
  }

  let totalCost = 0;
  let remainingToConsume = qtyRequired;

  const activeLayers = method === 'FIFO' ? inLayers : [...inLayers].reverse();

  for (const layer of activeLayers) {
    if (layer.qty > 0) {
      const consume = Math.min(layer.qty, remainingToConsume);
      totalCost += consume * layer.unitCost;
      remainingToConsume -= consume;
      if (remainingToConsume <= 0) break;
    }
  }

  if (remainingToConsume > 0) {
    const product = await db.product.findFirst({
      where: { id: productId, tenantId },
      select: { averageCost: true, purchasePrice: true },
    });
    const fallbackCost = Number(product?.averageCost ?? product?.purchasePrice ?? 0);
    totalCost += remainingToConsume * fallbackCost;
  }

  return totalCost / qtyRequired;
}

export async function recordInventoryCosting(
  db: InventoryDbClient,
  tenantId: string,
  input: {
    movementId: string;
    productId: string;
    warehouseId: string;
    type: MovementType;
    quantity: number;
    previousQuantity: number;
    quantityChange?: number;
    resultingQuantity?: number;
    unitCost?: number | null;
    date?: Date;
  },
): Promise<void> {
  const rules = await getInventoryRules(db, tenantId);
  const product = await db.product.findFirst({
    where: { id: input.productId, tenantId, deletedAt: null },
    select: { costingMethod: true, averageCost: true, purchasePrice: true },
  });
  if (!product) throw new ValidationError('Urun bulunamadi.');

  const costingMethod = product.costingMethod ?? rules.defaultCostingMethod;
  const currentAverageCost = quantityValue(product.averageCost);
  const purchasePrice = quantityValue(product.purchasePrice);
  const inboundUnitCost = input.unitCost ?? (currentAverageCost > 0 ? currentAverageCost : purchasePrice);
  const defaultChange = input.type === MovementType.IN || input.type === MovementType.OPENING || input.type === MovementType.RETURN
    ? input.quantity
    : -input.quantity;
  const quantityChange = input.quantityChange ?? defaultChange;
  const qtyIn = quantityChange > 0 ? quantityChange : 0;
  const qtyOut = quantityChange < 0 ? Math.abs(quantityChange) : 0;
  const qtyBalance = input.resultingQuantity ?? input.previousQuantity + quantityChange;

  let valuationUnitCost = qtyIn > 0 ? inboundUnitCost : (currentAverageCost > 0 ? currentAverageCost : inboundUnitCost);

  if (qtyOut > 0) {
    if (costingMethod === CostingMethod.FIFO || costingMethod === CostingMethod.LIFO) {
      const calculatedCost = await calculateLayerCost(db, tenantId, input.productId, input.warehouseId, input.quantity, costingMethod);
      await db.stockMovement.update({
        where: { id: input.movementId },
        data: {
          unitCost: calculatedCost,
          totalCost: calculatedCost * input.quantity,
        },
      });
      valuationUnitCost = calculatedCost;
    } else if (costingMethod === CostingMethod.STANDARD) {
      const standardCost = purchasePrice > 0 ? purchasePrice : currentAverageCost;
      await db.stockMovement.update({
        where: { id: input.movementId },
        data: {
          unitCost: standardCost,
          totalCost: standardCost * input.quantity,
        },
      });
      valuationUnitCost = standardCost;
    }
  }

  if (qtyIn > 0) {
    if (
      costingMethod === CostingMethod.MOVING_AVERAGE ||
      costingMethod === CostingMethod.FIFO ||
      costingMethod === CostingMethod.LIFO
    ) {
      const previousValue = Math.max(input.previousQuantity, 0) * currentAverageCost;
      const incomingValue = input.quantity * inboundUnitCost;
      const nextQuantity = Math.max(input.previousQuantity, 0) + input.quantity;
      const nextAverageCost = nextQuantity > 0 ? (previousValue + incomingValue) / nextQuantity : inboundUnitCost;
      await db.product.update({
        where: { id: input.productId },
        data: { averageCost: nextAverageCost },
      });
    } else if (costingMethod === CostingMethod.STANDARD) {
      const standardCost = purchasePrice > 0 ? purchasePrice : currentAverageCost;
      await db.product.update({
        where: { id: input.productId },
        data: { averageCost: standardCost },
      });
    }
  }

  await db.stockValuation.create({
    data: {
      tenantId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementId: input.movementId,
      date: input.date ?? new Date(),
      qtyIn,
      qtyOut,
      qtyBalance,
      unitCost: valuationUnitCost,
      totalValue: qtyBalance * valuationUnitCost,
    },
  });
}
