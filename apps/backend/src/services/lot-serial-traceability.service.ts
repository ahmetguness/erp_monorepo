import { LotUsedRefType, MovementRefType, MovementType, type Prisma, type PrismaClient } from '@prisma/client';

export type TraceabilitySourceType =
  | 'LOT_SERIAL'
  | 'PRODUCT_BATCH'
  | 'STOCK_MOVEMENT'
  | 'DELIVERY_NOTE'
  | 'SALES_ORDER'
  | 'PURCHASE_ORDER'
  | 'INVOICE'
  | 'WORK_ORDER'
  | 'SERVICE_REQUEST'
  | 'OTHER';

export type TraceabilityDirection = 'IN' | 'OUT' | 'NEUTRAL';

export interface TraceabilityReportFilter {
  lotId?: string;
  batchId?: string;
  productId?: string;
}

export interface TraceabilityReportItem {
  id: string;
  sourceType: TraceabilitySourceType;
  sourceId: string;
  sourceNumber: string | null;
  sourceLabel: string;
  date: string | null;
  productId: string;
  productCode: string;
  productName: string;
  serialNumber: string | null;
  batchNumber: string | null;
  quantity: number | null;
  direction: TraceabilityDirection;
  detail: string | null;
}

export interface TraceabilityReport {
  generatedAt: string;
  filters: TraceabilityReportFilter;
  summary: {
    lotCount: number;
    batchCount: number;
    movementCount: number;
    deliveryCount: number;
    invoiceCount: number;
    serviceCount: number;
  };
  items: TraceabilityReportItem[];
}

interface SourceLabel {
  number: string | null;
  label: string;
  date: Date | null;
}

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function movementDirection(type: MovementType): TraceabilityDirection {
  if (type === MovementType.IN || type === MovementType.OPENING || type === MovementType.RETURN) return 'IN';
  if (type === MovementType.OUT) return 'OUT';
  return 'NEUTRAL';
}

function sourceKey(sourceType: TraceabilitySourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

function itemKey(parts: Array<string | number | null>): string {
  return parts.map((part) => String(part ?? '-')).join(':');
}

function usedRefTypeToSourceType(refType: LotUsedRefType | null): TraceabilitySourceType {
  switch (refType) {
    case LotUsedRefType.SALES_ORDER:
      return 'SALES_ORDER';
    case LotUsedRefType.WORK_ORDER:
      return 'WORK_ORDER';
    case LotUsedRefType.DELIVERY_NOTE:
      return 'DELIVERY_NOTE';
    case LotUsedRefType.OTHER:
      return 'OTHER';
    default:
      return 'OTHER';
  }
}

function movementRefTypeToSourceType(refType: MovementRefType | null): TraceabilitySourceType {
  switch (refType) {
    case MovementRefType.SALES_ORDER:
      return 'SALES_ORDER';
    case MovementRefType.PURCHASE_ORDER:
      return 'PURCHASE_ORDER';
    case MovementRefType.WORK_ORDER:
      return 'WORK_ORDER';
    case MovementRefType.DELIVERY_NOTE:
      return 'DELIVERY_NOTE';
    case MovementRefType.STOCK_COUNT:
    case MovementRefType.MANUAL:
    case MovementRefType.OTHER:
    default:
      return 'STOCK_MOVEMENT';
  }
}

export class LotSerialTraceabilityService {
  constructor(private readonly db: PrismaClient) {}

  async getReport(tenantId: string, filters: TraceabilityReportFilter): Promise<TraceabilityReport> {
    if (!filters.lotId && !filters.batchId && !filters.productId) {
      return this.emptyReport(filters);
    }

    const lotWhere = {
      tenantId,
      ...(filters.lotId ? { id: filters.lotId } : {}),
      ...(filters.batchId ? { batchId: filters.batchId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
    };
    const batchWhere = {
      tenantId,
      ...(filters.batchId ? { id: filters.batchId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.lotId ? { lots: { some: { id: filters.lotId, tenantId } } } : {}),
    };

    const [lots, batches] = await this.db.$transaction([
      this.db.lotSerialNumber.findMany({
        where: lotWhere,
        include: {
          product: { select: { id: true, code: true, name: true } },
          batch: { select: { id: true, batchNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.productBatch.findMany({
        where: batchWhere,
        include: {
          product: { select: { id: true, code: true, name: true } },
          _count: { select: { lots: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const lotIds = lots.map((lot) => lot.id);
    const batchIds = batches.map((batch) => batch.id);
    const productIds = [
      ...new Set([
        ...lots.map((lot) => lot.productId),
        ...batches.map((batch) => batch.productId),
        ...(filters.productId ? [filters.productId] : []),
      ]),
    ];
    const movementWhereOr: Prisma.StockMovementWhereInput[] = [
      ...(lotIds.length > 0 ? [{ lotId: { in: lotIds } }] : []),
      ...(batchIds.length > 0 ? [{ batchId: { in: batchIds } }] : []),
      ...(filters.productId ? [{ productId: filters.productId }] : []),
    ];
    const deliveryItemWhereOr: Prisma.DeliveryNoteItemWhereInput[] = [
      ...(lotIds.length > 0 ? [{ lotId: { in: lotIds } }] : []),
      ...(batchIds.length > 0 ? [{ batchId: { in: batchIds } }] : []),
      ...(filters.productId ? [{ productId: filters.productId }] : []),
    ];

    const movements = movementWhereOr.length > 0
      ? await this.db.stockMovement.findMany({
          where: {
            tenantId,
            OR: movementWhereOr,
          },
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, serialNumber: true } },
            batch: { select: { id: true, batchNumber: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        })
      : [];
    const deliveryItems = deliveryItemWhereOr.length > 0
      ? await this.db.deliveryNoteItem.findMany({
          where: {
            tenantId,
            OR: deliveryItemWhereOr,
          },
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, serialNumber: true } },
            batch: { select: { id: true, batchNumber: true } },
            deliveryNote: {
              select: {
                id: true,
                number: true,
                type: true,
                date: true,
                salesOrderId: true,
                purchaseOrderId: true,
                contact: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
          take: 500,
        })
      : [];

    const sourceIds = {
      deliveryNoteIds: new Set<string>(),
      salesOrderIds: new Set<string>(),
      purchaseOrderIds: new Set<string>(),
      invoiceIds: new Set<string>(),
      workOrderIds: new Set<string>(),
      serviceRequestIds: new Set<string>(),
    };

    for (const lot of lots) {
      if (!lot.usedRefId) continue;
      const sourceType = usedRefTypeToSourceType(lot.usedRefType);
      this.collectSourceId(sourceIds, sourceType, lot.usedRefId);
    }

    for (const movement of movements) {
      if (movement.refId) this.collectSourceId(sourceIds, movementRefTypeToSourceType(movement.refType), movement.refId);
    }

    for (const item of deliveryItems) {
      sourceIds.deliveryNoteIds.add(item.deliveryNoteId);
      if (item.deliveryNote.salesOrderId) sourceIds.salesOrderIds.add(item.deliveryNote.salesOrderId);
      if (item.deliveryNote.purchaseOrderId) sourceIds.purchaseOrderIds.add(item.deliveryNote.purchaseOrderId);
    }

    const invoiceWhereOr: Prisma.InvoiceWhereInput[] = [
      ...(sourceIds.salesOrderIds.size > 0 ? [{ salesOrderId: { in: [...sourceIds.salesOrderIds] } }] : []),
      ...(sourceIds.purchaseOrderIds.size > 0 ? [{ purchaseOrderId: { in: [...sourceIds.purchaseOrderIds] } }] : []),
      ...(productIds.length > 0 && sourceIds.salesOrderIds.size === 0 && sourceIds.purchaseOrderIds.size === 0
        ? [{ lines: { some: { productId: { in: productIds } } } }]
        : []),
    ];
    const linkedInvoices = invoiceWhereOr.length > 0
      ? await this.db.invoice.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: invoiceWhereOr,
          },
          select: { id: true, number: true, date: true, salesOrderId: true, purchaseOrderId: true, type: true },
          take: 100,
        })
      : [];
    linkedInvoices.forEach((invoice) => sourceIds.invoiceIds.add(invoice.id));

    const sourceLabels = await this.resolveSourceLabels(tenantId, sourceIds);
    const items = new Map<string, TraceabilityReportItem>();

    for (const lot of lots) {
      this.addItem(items, {
        id: itemKey(['lot', lot.id]),
        sourceType: 'LOT_SERIAL',
        sourceId: lot.id,
        sourceNumber: lot.serialNumber,
        sourceLabel: lot.isUsed ? 'Lot/seri kullanılmış' : 'Lot/seri müsait',
        date: isoDate(lot.usedAt ?? lot.createdAt),
        productId: lot.productId,
        productCode: lot.product.code,
        productName: lot.product.name,
        serialNumber: lot.serialNumber,
        batchNumber: lot.batch?.batchNumber ?? null,
        quantity: 1,
        direction: lot.isUsed ? 'OUT' : 'NEUTRAL',
        detail: lot.usedRefId ? `Kullanım referansı: ${lot.usedRefType ?? 'OTHER'} / ${lot.usedRefId}` : null,
      });

      if (lot.usedRefId) {
        const rawSourceType = usedRefTypeToSourceType(lot.usedRefType);
        const sourceType =
          rawSourceType === 'OTHER' && sourceLabels.has(sourceKey('SERVICE_REQUEST', lot.usedRefId))
            ? 'SERVICE_REQUEST'
            : rawSourceType;
        const label = this.labelFor(sourceLabels, sourceType, lot.usedRefId);
        this.addItem(items, {
          id: itemKey(['lot-used', lot.id, sourceType, lot.usedRefId]),
          sourceType,
          sourceId: lot.usedRefId,
          sourceNumber: label.number,
          sourceLabel: label.label,
          date: isoDate(label.date ?? lot.usedAt),
          productId: lot.productId,
          productCode: lot.product.code,
          productName: lot.product.name,
          serialNumber: lot.serialNumber,
          batchNumber: lot.batch?.batchNumber ?? null,
          quantity: 1,
          direction: 'OUT',
          detail: 'Lot/seri kullanım ataması',
        });
      }
    }

    for (const batch of batches) {
      this.addItem(items, {
        id: itemKey(['batch', batch.id]),
        sourceType: 'PRODUCT_BATCH',
        sourceId: batch.id,
        sourceNumber: batch.batchNumber,
        sourceLabel: 'Ürün partisi',
        date: isoDate(batch.createdAt),
        productId: batch.productId,
        productCode: batch.product.code,
        productName: batch.product.name,
        serialNumber: null,
        batchNumber: batch.batchNumber,
        quantity: numberValue(batch.quantity),
        direction: 'NEUTRAL',
        detail: `${batch._count.lots} lot/seri bağlı`,
      });
    }

    for (const movement of movements) {
      const sourceType = movement.refId ? movementRefTypeToSourceType(movement.refType) : 'STOCK_MOVEMENT';
      const sourceId = movement.refId ?? movement.id;
      const label = this.labelFor(sourceLabels, sourceType, sourceId);
      this.addItem(items, {
        id: itemKey(['movement', movement.id]),
        sourceType,
        sourceId,
        sourceNumber: label.number,
        sourceLabel: label.label,
        date: isoDate(movement.createdAt),
        productId: movement.productId,
        productCode: movement.product.code,
        productName: movement.product.name,
        serialNumber: movement.lot?.serialNumber ?? null,
        batchNumber: movement.batch?.batchNumber ?? null,
        quantity: numberValue(movement.quantity),
        direction: movementDirection(movement.type),
        detail: movement.notes ?? `Stok hareketi: ${movement.type}`,
      });
    }

    for (const item of deliveryItems) {
      const label = this.labelFor(sourceLabels, 'DELIVERY_NOTE', item.deliveryNoteId);
      this.addItem(items, {
        id: itemKey(['delivery', item.id]),
        sourceType: 'DELIVERY_NOTE',
        sourceId: item.deliveryNoteId,
        sourceNumber: label.number,
        sourceLabel: label.label,
        date: isoDate(item.deliveryNote.date),
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.name,
        serialNumber: item.lot?.serialNumber ?? null,
        batchNumber: item.batch?.batchNumber ?? null,
        quantity: numberValue(item.deliveredQty),
        direction: item.deliveryNote.type === 'OUTBOUND' ? 'OUT' : 'IN',
        detail: item.deliveryNote.contact?.name ?? null,
      });
    }

    for (const invoice of linkedInvoices) {
      const label = this.labelFor(sourceLabels, 'INVOICE', invoice.id);
      this.addItem(items, {
        id: itemKey(['invoice', invoice.id]),
        sourceType: 'INVOICE',
        sourceId: invoice.id,
        sourceNumber: label.number,
        sourceLabel: label.label,
        date: isoDate(invoice.date),
        productId: productIds[0] ?? filters.productId ?? '',
        productCode: '',
        productName: 'Faturaya bağlı ürün/parti',
        serialNumber: null,
        batchNumber: null,
        quantity: null,
        direction: invoice.type === 'SALES' || invoice.type === 'RETURN_PURCHASE' ? 'OUT' : 'IN',
        detail: invoice.salesOrderId ? `Satış siparişi: ${invoice.salesOrderId}` : invoice.purchaseOrderId ? `Satın alma siparişi: ${invoice.purchaseOrderId}` : null,
      });
    }

    const sortedItems = [...items.values()].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

    return {
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        lotCount: lots.length,
        batchCount: batches.length,
        movementCount: movements.length,
        deliveryCount: deliveryItems.length,
        invoiceCount: linkedInvoices.length,
        serviceCount: sortedItems.filter((item) => item.sourceType === 'SERVICE_REQUEST').length,
      },
      items: sortedItems,
    };
  }

  private collectSourceId(
    target: {
      deliveryNoteIds: Set<string>;
      salesOrderIds: Set<string>;
      purchaseOrderIds: Set<string>;
      invoiceIds: Set<string>;
      workOrderIds: Set<string>;
      serviceRequestIds: Set<string>;
    },
    sourceType: TraceabilitySourceType,
    id: string,
  ): void {
    if (sourceType === 'DELIVERY_NOTE') target.deliveryNoteIds.add(id);
    else if (sourceType === 'SALES_ORDER') target.salesOrderIds.add(id);
    else if (sourceType === 'PURCHASE_ORDER') target.purchaseOrderIds.add(id);
    else if (sourceType === 'INVOICE') target.invoiceIds.add(id);
    else if (sourceType === 'WORK_ORDER') target.workOrderIds.add(id);
    else if (sourceType === 'SERVICE_REQUEST' || sourceType === 'OTHER') target.serviceRequestIds.add(id);
  }

  private emptyReport(filters: TraceabilityReportFilter): TraceabilityReport {
    return {
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        lotCount: 0,
        batchCount: 0,
        movementCount: 0,
        deliveryCount: 0,
        invoiceCount: 0,
        serviceCount: 0,
      },
      items: [],
    };
  }

  private addItem(items: Map<string, TraceabilityReportItem>, item: TraceabilityReportItem): void {
    if (!items.has(item.id)) items.set(item.id, item);
  }

  private labelFor(labels: Map<string, SourceLabel>, sourceType: TraceabilitySourceType, sourceId: string): SourceLabel {
    return labels.get(sourceKey(sourceType, sourceId)) ?? {
      number: null,
      label: `${sourceType} / ${sourceId}`,
      date: null,
    };
  }

  private async resolveSourceLabels(
    tenantId: string,
    sourceIds: {
      deliveryNoteIds: Set<string>;
      salesOrderIds: Set<string>;
      purchaseOrderIds: Set<string>;
      invoiceIds: Set<string>;
      workOrderIds: Set<string>;
      serviceRequestIds: Set<string>;
    },
  ): Promise<Map<string, SourceLabel>> {
    const labels = new Map<string, SourceLabel>();
    const [deliveryNotes, salesOrders, purchaseOrders, invoices, workOrders, serviceRequests] = await this.db.$transaction([
      this.db.deliveryNote.findMany({
        where: { tenantId, id: { in: [...sourceIds.deliveryNoteIds] } },
        select: { id: true, number: true, date: true, type: true },
      }),
      this.db.salesOrder.findMany({
        where: { tenantId, id: { in: [...sourceIds.salesOrderIds] } },
        select: { id: true, number: true, date: true },
      }),
      this.db.purchaseOrder.findMany({
        where: { tenantId, id: { in: [...sourceIds.purchaseOrderIds] } },
        select: { id: true, number: true, date: true },
      }),
      this.db.invoice.findMany({
        where: { tenantId, id: { in: [...sourceIds.invoiceIds] } },
        select: { id: true, number: true, date: true, type: true },
      }),
      this.db.workOrder.findMany({
        where: { tenantId, id: { in: [...sourceIds.workOrderIds] } },
        select: { id: true, number: true, startDate: true },
      }),
      this.db.serviceRequest.findMany({
        where: { tenantId, id: { in: [...sourceIds.serviceRequestIds] }, deletedAt: null },
        select: { id: true, number: true, createdAt: true, subject: true },
      }),
    ]);

    deliveryNotes.forEach((row) => labels.set(sourceKey('DELIVERY_NOTE', row.id), {
      number: row.number,
      label: `İrsaliye ${row.number} (${row.type})`,
      date: row.date,
    }));
    salesOrders.forEach((row) => labels.set(sourceKey('SALES_ORDER', row.id), {
      number: row.number,
      label: `Satış siparişi ${row.number}`,
      date: row.date,
    }));
    purchaseOrders.forEach((row) => labels.set(sourceKey('PURCHASE_ORDER', row.id), {
      number: row.number,
      label: `Satın alma siparişi ${row.number}`,
      date: row.date,
    }));
    invoices.forEach((row) => labels.set(sourceKey('INVOICE', row.id), {
      number: row.number,
      label: `Fatura ${row.number} (${row.type})`,
      date: row.date,
    }));
    workOrders.forEach((row) => labels.set(sourceKey('WORK_ORDER', row.id), {
      number: row.number,
      label: `İş emri ${row.number}`,
      date: row.startDate,
    }));
    serviceRequests.forEach((row) => {
      const value = { number: row.number, label: `Servis ${row.number} - ${row.subject}`, date: row.createdAt };
      labels.set(sourceKey('SERVICE_REQUEST', row.id), value);
      labels.set(sourceKey('OTHER', row.id), value);
    });

    return labels;
  }
}
