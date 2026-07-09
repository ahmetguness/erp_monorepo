import { DeliveryNoteStatus, InvoiceStatus, PurchaseOrderStatus, PurchaseRequestStatus, type Prisma, type PrismaClient } from '@prisma/client';

export type PurchaseTraceStageKey = 'request' | 'order' | 'delivery' | 'invoice';
export type PurchaseTraceStageStatus = 'complete' | 'partial' | 'pending' | 'missing' | 'cancelled';

export interface PurchaseTraceRequest {
  id: string;
  number: string;
  status: PurchaseRequestStatus;
  date: string;
  totalEstimated: number | null;
}

export interface PurchaseTraceOrder {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  date: string;
  totalGross: number;
}

export interface PurchaseTraceDeliveryNote {
  id: string;
  number: string;
  status: DeliveryNoteStatus;
  type: string;
  date: string;
  deliveredAt: string | null;
}

export interface PurchaseTraceInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  type: string;
  date: string;
  totalGross: number;
}

export interface PurchaseTraceStage {
  key: PurchaseTraceStageKey;
  label: string;
  status: PurchaseTraceStageStatus;
  count: number;
  href: string | null;
}

export interface PurchaseTrace {
  order: PurchaseTraceOrder;
  requests: PurchaseTraceRequest[];
  deliveryNotes: PurchaseTraceDeliveryNote[];
  invoices: PurchaseTraceInvoice[];
  stages: PurchaseTraceStage[];
  summary: {
    requestCount: number;
    deliveryNoteCount: number;
    invoiceCount: number;
    deliveredQuantity: number;
    orderedQuantity: number;
    invoicedAmount: number;
    orderedAmount: number;
  };
}

interface PurchaseOrderForTrace {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  date: Date;
  totalGross: Prisma.Decimal | number;
  items: Array<{
    quantity: Prisma.Decimal | number;
    received: Prisma.Decimal | number;
  }>;
}

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function isoDate(value: Date): string {
  return value.toISOString();
}

function deliveryStageStatus(notes: PurchaseTraceDeliveryNote[], order: PurchaseOrderForTrace): PurchaseTraceStageStatus {
  if (order.status === PurchaseOrderStatus.CANCELLED) return 'cancelled';
  if (notes.some((note) => note.status === DeliveryNoteStatus.DELIVERED)) return 'complete';
  if (notes.length > 0 || order.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) return 'partial';
  return 'missing';
}

function invoiceStageStatus(invoices: PurchaseTraceInvoice[], order: PurchaseOrderForTrace): PurchaseTraceStageStatus {
  if (order.status === PurchaseOrderStatus.CANCELLED) return 'cancelled';
  if (invoices.length === 0) return 'missing';
  if (invoices.every((invoice) => invoice.status === InvoiceStatus.CANCELLED)) return 'cancelled';
  if (invoices.some((invoice) => invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.SENT)) return 'complete';
  return 'partial';
}

export class PurchaseTraceService {
  constructor(private readonly db: PrismaClient) {}

  async getTrace(tenantId: string, order: PurchaseOrderForTrace): Promise<PurchaseTrace> {
    const [requests, deliveryNotes, invoices] = await this.db.$transaction([
      this.db.purchaseRequest.findMany({
        where: { tenantId, purchaseOrderId: order.id, deletedAt: null },
        select: { id: true, number: true, status: true, date: true, totalEstimated: true },
        orderBy: { date: 'asc' },
      }),
      this.db.deliveryNote.findMany({
        where: { tenantId, purchaseOrderId: order.id, deletedAt: null },
        select: { id: true, number: true, status: true, type: true, date: true, deliveredAt: true },
        orderBy: { date: 'asc' },
      }),
      this.db.invoice.findMany({
        where: { tenantId, purchaseOrderId: order.id, deletedAt: null },
        select: { id: true, number: true, status: true, type: true, date: true, totalGross: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const mappedRequests: PurchaseTraceRequest[] = requests.map((request) => ({
      id: request.id,
      number: request.number,
      status: request.status,
      date: isoDate(request.date),
      totalEstimated: request.totalEstimated === null ? null : numberValue(request.totalEstimated),
    }));
    const mappedDeliveryNotes: PurchaseTraceDeliveryNote[] = deliveryNotes.map((note) => ({
      id: note.id,
      number: note.number,
      status: note.status,
      type: note.type,
      date: isoDate(note.date),
      deliveredAt: note.deliveredAt ? isoDate(note.deliveredAt) : null,
    }));
    const mappedInvoices: PurchaseTraceInvoice[] = invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      type: invoice.type,
      date: isoDate(invoice.date),
      totalGross: numberValue(invoice.totalGross),
    }));
    const orderedQuantity = order.items.reduce((sum, item) => sum + numberValue(item.quantity), 0);
    const deliveredQuantity = order.items.reduce((sum, item) => sum + numberValue(item.received), 0);
    const orderedAmount = numberValue(order.totalGross);
    const invoicedAmount = mappedInvoices
      .filter((invoice) => invoice.status !== InvoiceStatus.CANCELLED)
      .reduce((sum, invoice) => sum + invoice.totalGross, 0);

    return {
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        date: isoDate(order.date),
        totalGross: orderedAmount,
      },
      requests: mappedRequests,
      deliveryNotes: mappedDeliveryNotes,
      invoices: mappedInvoices,
      stages: [
        {
          key: 'request',
          label: 'Talep',
          status: mappedRequests.length > 0 ? 'complete' : 'missing',
          count: mappedRequests.length,
          href: '/dashboard/purchase-orders/requests',
        },
        {
          key: 'order',
          label: 'Siparis',
          status: order.status === PurchaseOrderStatus.CANCELLED ? 'cancelled' : 'complete',
          count: 1,
          href: `/dashboard/purchase-orders/${order.id}`,
        },
        {
          key: 'delivery',
          label: 'Irsaliye',
          status: deliveryStageStatus(mappedDeliveryNotes, order),
          count: mappedDeliveryNotes.length,
          href: '/dashboard/delivery-notes',
        },
        {
          key: 'invoice',
          label: 'Fatura',
          status: invoiceStageStatus(mappedInvoices, order),
          count: mappedInvoices.length,
          href: '/dashboard/invoices',
        },
      ],
      summary: {
        requestCount: mappedRequests.length,
        deliveryNoteCount: mappedDeliveryNotes.length,
        invoiceCount: mappedInvoices.length,
        deliveredQuantity,
        orderedQuantity,
        invoicedAmount,
        orderedAmount,
      },
    };
  }
}
