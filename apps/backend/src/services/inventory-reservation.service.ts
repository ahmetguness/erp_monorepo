import { OrderStatus, ReservationRefType, type Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../errors';
import { assertCanReserveStock, getStockPosition } from './inventory-rules.service';

export interface SalesOrderReservationInput {
  orderId: string;
  warehouseId: string;
  allowPartial: boolean;
  expiresAt?: string | null;
}

export interface SalesOrderReservationLineResult {
  productId: string;
  productCode: string;
  productName: string;
  requestedQuantity: number;
  alreadyReservedQuantity: number;
  reservedQuantity: number;
  availableBeforeReservation: number;
  status: 'FULL' | 'PARTIAL' | 'SKIPPED';
}

export interface SalesOrderReservationResult {
  orderId: string;
  orderNumber: string;
  warehouseId: string;
  warehouseName: string;
  allowPartial: boolean;
  createdCount: number;
  totalReservedQuantity: number;
  lines: SalesOrderReservationLineResult[];
}

export interface ReservationReportRow {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  activeQuantity: number;
  expiredQuantity: number;
  releasedQuantity: number;
  totalQuantity: number;
  activeCount: number;
  expiredCount: number;
  releasedCount: number;
  earliestExpiry: string | null;
  latestReservedAt: string | null;
}

export interface ReservationReport {
  generatedAt: string;
  summary: {
    activeQuantity: number;
    expiredQuantity: number;
    releasedQuantity: number;
    totalQuantity: number;
    activeCount: number;
    expiredCount: number;
    releasedCount: number;
  };
  rows: ReservationReportRow[];
}

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function parseOptionalDate(value: string | null | undefined, label: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} gecersiz.`);
  return date;
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function reportKey(productId: string, warehouseId: string): string {
  return `${productId}:${warehouseId}`;
}

export class InventoryReservationService {
  constructor(private readonly db: PrismaClient) {}

  async releaseExpired(tenantId: string): Promise<{ releasedCount: number; releasedAt: string }> {
    const now = new Date();
    const result = await this.db.inventoryReservation.updateMany({
      where: {
        tenantId,
        releasedAt: null,
        expiresAt: { lt: now },
      },
      data: { releasedAt: now },
    });

    return { releasedCount: result.count, releasedAt: now.toISOString() };
  }

  async createSalesOrderReservations(
    tenantId: string,
    userId: string,
    input: SalesOrderReservationInput,
  ): Promise<SalesOrderReservationResult> {
    if (!input.orderId || !input.warehouseId) {
      throw new ValidationError('orderId ve warehouseId zorunludur.');
    }

    const expiresAt = parseOptionalDate(input.expiresAt, 'expiresAt');

    const [order, warehouse] = await Promise.all([
      this.db.salesOrder.findFirst({
        where: { id: input.orderId, tenantId, deletedAt: null },
        include: {
          items: { include: { product: { select: { id: true, code: true, name: true } } } },
        },
      }),
      this.db.warehouse.findFirst({
        where: { id: input.warehouseId, tenantId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    if (!order) throw new NotFoundError('Satis siparisi', input.orderId);
    if (!warehouse) throw new NotFoundError('Depo', input.warehouseId);
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.DELIVERED) {
      throw new ValidationError('Iptal edilmis veya teslim edilmis siparis icin rezervasyon olusturulamaz.');
    }

    const createdReservations: Array<{ quantity: number }> = [];
    const lines: SalesOrderReservationLineResult[] = [];
    const productLines = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      requestedQuantity: number;
    }>();

    for (const item of order.items) {
      const requestedQuantity = numberValue(item.quantity);
      if (requestedQuantity <= 0) continue;
      const current = productLines.get(item.productId);
      if (current) {
        current.requestedQuantity += requestedQuantity;
      } else {
        productLines.set(item.productId, {
          productId: item.productId,
          productCode: item.product?.code ?? '',
          productName: item.product?.name ?? item.description ?? item.productId,
          requestedQuantity,
        });
      }
    }

    await this.db.$transaction(async (tx) => {
      for (const item of productLines.values()) {
        const activeSameRef = await tx.inventoryReservation.aggregate({
          where: {
            tenantId,
            productId: item.productId,
            warehouseId: input.warehouseId,
            refType: ReservationRefType.SALES_ORDER,
            refId: order.id,
            releasedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          _sum: { quantity: true },
        });
        const alreadyReservedQuantity = numberValue(activeSameRef._sum.quantity);
        const remainingQuantity = Math.max(0, item.requestedQuantity - alreadyReservedQuantity);
        const position = await getStockPosition(tx, tenantId, item.productId, input.warehouseId, {
          refType: ReservationRefType.SALES_ORDER,
          refId: order.id,
        });

        if (remainingQuantity <= 0) {
          lines.push({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            requestedQuantity: item.requestedQuantity,
            alreadyReservedQuantity,
            reservedQuantity: 0,
            availableBeforeReservation: position.available,
            status: 'SKIPPED',
          });
          continue;
        }

        const reserveQuantity = input.allowPartial
          ? Math.min(remainingQuantity, Math.max(0, position.available))
          : remainingQuantity;

        if (reserveQuantity <= 0) {
          if (!input.allowPartial) {
            await assertCanReserveStock(tx, tenantId, {
              productId: item.productId,
              warehouseId: input.warehouseId,
              quantity: remainingQuantity,
              refType: ReservationRefType.SALES_ORDER,
              refId: order.id,
            });
          }
          lines.push({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            requestedQuantity: item.requestedQuantity,
            alreadyReservedQuantity,
            reservedQuantity: 0,
            availableBeforeReservation: position.available,
            status: 'SKIPPED',
          });
          continue;
        }

        await assertCanReserveStock(tx, tenantId, {
          productId: item.productId,
          warehouseId: input.warehouseId,
          quantity: reserveQuantity,
          refType: ReservationRefType.SALES_ORDER,
          refId: order.id,
        });

        await tx.inventoryReservation.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: input.warehouseId,
            quantity: reserveQuantity,
            refType: ReservationRefType.SALES_ORDER,
            refId: order.id,
            notes: `${order.number} siparisi icin ${input.allowPartial ? 'kismi ' : ''}rezervasyon`,
            expiresAt,
            createdById: userId,
          },
        });
        createdReservations.push({ quantity: reserveQuantity });

        lines.push({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          requestedQuantity: item.requestedQuantity,
          alreadyReservedQuantity,
          reservedQuantity: reserveQuantity,
          availableBeforeReservation: position.available,
          status: reserveQuantity + alreadyReservedQuantity >= item.requestedQuantity ? 'FULL' : 'PARTIAL',
        });
      }
    });

    if (!createdReservations.length) {
      throw new ValidationError('Bu siparis icin olusturulacak yeni rezervasyon bulunamadi.');
    }

    return {
      orderId: order.id,
      orderNumber: order.number,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      allowPartial: input.allowPartial,
      createdCount: createdReservations.length,
      totalReservedQuantity: createdReservations.reduce((sum, reservation) => sum + reservation.quantity, 0),
      lines,
    };
  }

  async getReport(tenantId: string): Promise<ReservationReport> {
    const now = new Date();
    const reservations = await this.db.inventoryReservation.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { reservedAt: 'desc' },
    });

    const rows = new Map<string, ReservationReportRow>();
    const summary: ReservationReport['summary'] = {
      activeQuantity: 0,
      expiredQuantity: 0,
      releasedQuantity: 0,
      totalQuantity: 0,
      activeCount: 0,
      expiredCount: 0,
      releasedCount: 0,
    };

    for (const reservation of reservations) {
      const quantity = numberValue(reservation.quantity);
      const isReleased = Boolean(reservation.releasedAt);
      const isExpired = !isReleased && Boolean(reservation.expiresAt && reservation.expiresAt < now);
      const isActive = !isReleased && !isExpired;
      const key = reportKey(reservation.productId, reservation.warehouseId);
      const current = rows.get(key) ?? {
        productId: reservation.productId,
        productCode: reservation.product.code,
        productName: reservation.product.name,
        warehouseId: reservation.warehouseId,
        warehouseName: reservation.warehouse.name,
        activeQuantity: 0,
        expiredQuantity: 0,
        releasedQuantity: 0,
        totalQuantity: 0,
        activeCount: 0,
        expiredCount: 0,
        releasedCount: 0,
        earliestExpiry: null,
        latestReservedAt: null,
      };

      current.totalQuantity += quantity;
      summary.totalQuantity += quantity;

      if (isActive) {
        current.activeQuantity += quantity;
        current.activeCount += 1;
        summary.activeQuantity += quantity;
        summary.activeCount += 1;
        if (
          reservation.expiresAt &&
          (!current.earliestExpiry || reservation.expiresAt < new Date(current.earliestExpiry))
        ) {
          current.earliestExpiry = isoDate(reservation.expiresAt);
        }
      } else if (isExpired) {
        current.expiredQuantity += quantity;
        current.expiredCount += 1;
        summary.expiredQuantity += quantity;
        summary.expiredCount += 1;
      } else {
        current.releasedQuantity += quantity;
        current.releasedCount += 1;
        summary.releasedQuantity += quantity;
        summary.releasedCount += 1;
      }

      if (!current.latestReservedAt || reservation.reservedAt > new Date(current.latestReservedAt)) {
        current.latestReservedAt = isoDate(reservation.reservedAt);
      }

      rows.set(key, current);
    }

    return {
      generatedAt: now.toISOString(),
      summary,
      rows: [...rows.values()].sort((a, b) => b.activeQuantity - a.activeQuantity),
    };
  }
}
