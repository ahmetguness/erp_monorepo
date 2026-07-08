import { DeliveryNoteType, PurchaseOrderStatus, type PrismaClient } from '@prisma/client';

export interface SupplierPerformanceScore {
  score: number;
  leadTimeDays: number;
  leadTimeScore: number;
  deliveryDelayDays: number;
  deliveryDelayScore: number;
  priceDeviationPct: number;
  priceDeviationScore: number;
  returnRatePct: number;
  returnRateScore: number;
  qualityAcceptanceRatePct: number;
  qualityScore: number;
  openOrderCount: number;
  overdueOrderCount: number;
  openOrderScore: number;
  totalOrders: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_DAY);
}

function scoreLeadTime(days: number, sampleCount: number): number {
  if (sampleCount === 0) return 100;
  if (days <= 3) return 100;
  if (days <= 7) return 85;
  if (days <= 14) return 60;
  return 30;
}

function scoreDeliveryDelay(days: number, sampleCount: number): number {
  if (sampleCount === 0) return 100;
  if (days <= 0) return 100;
  if (days <= 2) return 90;
  if (days <= 7) return 70;
  if (days <= 14) return 50;
  return 25;
}

function scorePriceDeviation(deviationPct: number, sampleCount: number): number {
  if (sampleCount === 0) return 100;
  if (deviationPct <= 0) return 100;
  if (deviationPct <= 5) return 85;
  if (deviationPct <= 10) return 70;
  return 40;
}

function scoreReturnRate(returnRatePct: number, inboundCount: number): number {
  if (inboundCount === 0) return 100;
  if (returnRatePct === 0) return 100;
  if (returnRatePct <= 2) return 90;
  if (returnRatePct <= 5) return 75;
  if (returnRatePct <= 10) return 50;
  return 20;
}

function scoreQuality(acceptanceRatePct: number, returnRatePct: number, sampleCount: number): number {
  if (sampleCount === 0) return 100;
  return Math.max(0, Math.min(100, Math.round(acceptanceRatePct - returnRatePct * 2)));
}

export async function getSupplierPerformanceScore(
  db: PrismaClient,
  tenantId: string,
  contactId: string,
): Promise<SupplierPerformanceScore> {
  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { contactId, tenantId, deletedAt: null },
    include: {
      items: {
        include: {
          product: { select: { purchasePrice: true } },
        },
      },
      deliveryNotes: {
        where: { type: DeliveryNoteType.INBOUND, deletedAt: null },
        include: { items: true },
        orderBy: { deliveredAt: 'desc' },
      },
    },
  });

  let totalLeadTimeDays = 0;
  let leadTimeCount = 0;
  let totalDelayDays = 0;
  let delayCount = 0;
  let totalDeviationPct = 0;
  let itemPriceCount = 0;
  let orderedQuantity = 0;
  let deliveredQuantity = 0;

  for (const order of purchaseOrders) {
    const deliveredNote = order.deliveryNotes.find((deliveryNote) => deliveryNote.deliveredAt !== null);

    if (deliveredNote?.deliveredAt) {
      totalLeadTimeDays += daysBetween(order.date, deliveredNote.deliveredAt);
      leadTimeCount++;

      if (order.dueDate) {
        totalDelayDays += daysBetween(order.dueDate, deliveredNote.deliveredAt);
        delayCount++;
      }
    }

    for (const item of order.items) {
      const defaultPrice = Number(item.product.purchasePrice ?? 0);
      const actualPrice = Number(item.unitPrice);

      if (defaultPrice > 0) {
        totalDeviationPct += (actualPrice - defaultPrice) / defaultPrice;
        itemPriceCount++;
      }
    }

    for (const deliveryNote of order.deliveryNotes) {
      for (const item of deliveryNote.items) {
        orderedQuantity += Number(item.orderedQty);
        deliveredQuantity += Number(item.deliveredQty);
      }
    }
  }

  const deliveryNotes = await db.deliveryNote.findMany({
    where: { contactId, tenantId, deletedAt: null },
    select: { type: true },
  });
  const inboundCount = deliveryNotes.filter((deliveryNote) => deliveryNote.type === DeliveryNoteType.INBOUND).length;
  const returnCount = deliveryNotes.filter((deliveryNote) => deliveryNote.type === DeliveryNoteType.RETURN).length;

  const avgLeadTimeDays = leadTimeCount > 0 ? round(totalLeadTimeDays / leadTimeCount, 1) : 0;
  const leadTimeScore = scoreLeadTime(avgLeadTimeDays, leadTimeCount);
  const avgDeliveryDelayDays = delayCount > 0 ? round(totalDelayDays / delayCount, 1) : 0;
  const deliveryDelayScore = scoreDeliveryDelay(avgDeliveryDelayDays, delayCount);
  const avgPriceDeviationPct = itemPriceCount > 0 ? round((totalDeviationPct / itemPriceCount) * 100, 1) : 0;
  const priceDeviationScore = scorePriceDeviation(avgPriceDeviationPct, itemPriceCount);
  const returnRatePct = inboundCount > 0 ? round((returnCount / inboundCount) * 100, 1) : 0;
  const returnRateScore = scoreReturnRate(returnRatePct, inboundCount);
  const qualityAcceptanceRatePct = orderedQuantity > 0 ? round(Math.min(100, (deliveredQuantity / orderedQuantity) * 100), 1) : 100;
  const qualityScore = scoreQuality(qualityAcceptanceRatePct, returnRatePct, orderedQuantity);

  const openOrders = purchaseOrders.filter((order) => (
    order.status === PurchaseOrderStatus.SENT || order.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
  ));
  const overdueOrders = openOrders.filter((order) => order.dueDate !== null && order.dueDate.getTime() < Date.now());
  const openOrderRatio = purchaseOrders.length > 0 ? (purchaseOrders.length - overdueOrders.length) / purchaseOrders.length : 1;
  const openOrderScore = Math.round(openOrderRatio * 100);

  const hasPerformanceData = purchaseOrders.length > 0 || deliveryNotes.length > 0;
  const score = hasPerformanceData
    ? Math.round(
      deliveryDelayScore * 0.3
      + priceDeviationScore * 0.25
      + returnRateScore * 0.2
      + qualityScore * 0.25,
    )
    : 100;

  return {
    score,
    leadTimeDays: avgLeadTimeDays,
    leadTimeScore,
    deliveryDelayDays: avgDeliveryDelayDays,
    deliveryDelayScore,
    priceDeviationPct: avgPriceDeviationPct,
    priceDeviationScore,
    returnRatePct,
    returnRateScore,
    qualityAcceptanceRatePct,
    qualityScore,
    openOrderCount: openOrders.length,
    overdueOrderCount: overdueOrders.length,
    openOrderScore,
    totalOrders: purchaseOrders.length,
  };
}
