import {
  DeliveryNoteStatus,
  DeliveryNoteType,
  InvoiceStatus,
  InvoiceType,
  OrderStatus,
  ReservationRefType,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { createEventContext, domainEvents } from '../domain-events/index.js';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { writeInvoiceAccountEntry } from '../utils/account-entry.js';
import { InventoryReservationService, type SalesOrderReservationResult } from './inventory-reservation.service.js';
import { assertSalesOrderStatusTransition } from './financial/status-transition.service.js';

type SalesFulfillmentDb = PrismaClient;

export interface SalesFulfillmentInput {
  orderId: string;
  warehouseId?: string;
  userId: string;
  allowPartialReservation?: boolean;
  createDeliveryDraft?: boolean;
  createInvoiceDraft?: boolean;
  reservationExpiresAt?: string | null;
}

export interface SalesFulfillmentResult {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  warehouseId: string;
  reservation: SalesOrderReservationResult | null;
  deliveryNoteId: string | null;
  deliveryNoteNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  skipped: {
    reservation: string | null;
    deliveryDraft: string | null;
    invoiceDraft: string | null;
  };
}

type FulfillmentOrder = Prisma.SalesOrderGetPayload<{
  include: { contact: { select: { id: true; name: true } }; items: true };
}>;

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function addDays(baseDate: Date, days: number): Date {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export class SalesFulfillmentService {
  constructor(private readonly db: SalesFulfillmentDb) {}

  async fulfill(tenantId: string, input: SalesFulfillmentInput): Promise<SalesFulfillmentResult> {
    const order = await this.loadOrder(tenantId, input.orderId);
    const warehouseId = input.warehouseId ?? await this.resolveDefaultWarehouseId(tenantId);

    const confirmedOrder = await this.ensureConfirmed(tenantId, order, input.userId);
    const reservation = await this.createReservation(tenantId, input, warehouseId);
    const deliveryDraft = input.createDeliveryDraft === false
      ? null
      : await this.ensureDeliveryDraft(tenantId, confirmedOrder, warehouseId, input.userId);
    const invoiceDraft = input.createInvoiceDraft === false
      ? null
      : await this.ensureInvoiceDraft(tenantId, confirmedOrder, input.userId);

    return {
      orderId: confirmedOrder.id,
      orderNumber: confirmedOrder.number,
      orderStatus: confirmedOrder.status,
      warehouseId,
      reservation: reservation.result,
      deliveryNoteId: deliveryDraft?.id ?? null,
      deliveryNoteNumber: deliveryDraft?.number ?? null,
      invoiceId: invoiceDraft?.id ?? null,
      invoiceNumber: invoiceDraft?.number ?? null,
      skipped: {
        reservation: reservation.skippedReason,
        deliveryDraft: deliveryDraft?.skippedReason ?? (input.createDeliveryDraft === false ? 'Irsaliye taslagi istenmedi.' : null),
        invoiceDraft: invoiceDraft?.skippedReason ?? (input.createInvoiceDraft === false ? 'Fatura taslagi istenmedi.' : null),
      },
    };
  }

  private async loadOrder(tenantId: string, orderId: string): Promise<FulfillmentOrder> {
    const order = await this.db.salesOrder.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!order) throw new NotFoundError('Satis siparisi', orderId);
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.DELIVERED) {
      throw new ValidationError('Iptal edilmis veya teslim edilmis siparis otomatik akisa alinmaz.');
    }
    if (order.items.length === 0) throw new ValidationError('Sipariste otomasyona alinacak kalem bulunmuyor.');
    return order;
  }

  private async resolveDefaultWarehouseId(tenantId: string): Promise<string> {
    const warehouse = await this.db.warehouse.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true },
    });
    if (!warehouse) {
      throw new ValidationError('Otomatik satis akisi icin aktif depo bulunamadi. Depo secerek tekrar deneyin.');
    }
    return warehouse.id;
  }

  private async ensureConfirmed(tenantId: string, order: FulfillmentOrder, userId: string): Promise<FulfillmentOrder> {
    if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.PARTIALLY_DELIVERED) return order;

    assertSalesOrderStatusTransition(order.status, OrderStatus.CONFIRMED);
    await this.db.$transaction(async (tx) => {
      await tx.salesOrder.updateMany({
        where: { id: order.id, tenantId },
        data: { status: OrderStatus.CONFIRMED, updatedById: userId },
      });
      await tx.salesOrderHistory.create({
        data: {
          tenantId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.CONFIRMED,
          notes: 'Otomatik satis akisi icin onaylandi',
          createdById: userId,
        },
      });
    });

    return { ...order, status: OrderStatus.CONFIRMED };
  }

  private async createReservation(
    tenantId: string,
    input: SalesFulfillmentInput,
    warehouseId: string,
  ): Promise<{ result: SalesOrderReservationResult | null; skippedReason: string | null }> {
    const activeCount = await this.db.inventoryReservation.count({
      where: {
        tenantId,
        refType: ReservationRefType.SALES_ORDER,
        refId: input.orderId,
        releasedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (activeCount > 0) return { result: null, skippedReason: 'Aktif rezervasyon zaten var.' };

    const reservationService = new InventoryReservationService(this.db);
    const result = await reservationService.createSalesOrderReservations(tenantId, input.userId, {
      orderId: input.orderId,
      warehouseId,
      allowPartial: input.allowPartialReservation ?? false,
      expiresAt: input.reservationExpiresAt ?? null,
    });
    return { result, skippedReason: null };
  }

  private async ensureDeliveryDraft(
    tenantId: string,
    order: FulfillmentOrder,
    warehouseId: string,
    userId: string,
  ): Promise<{ id: string | null; number: string | null; skippedReason: string | null }> {
    const existing = await this.db.deliveryNote.findFirst({
      where: {
        tenantId,
        salesOrderId: order.id,
        type: DeliveryNoteType.OUTBOUND,
        deletedAt: null,
        status: { not: DeliveryNoteStatus.CANCELLED },
      },
      select: { id: true, number: true },
    });
    if (existing) return { id: existing.id, number: existing.number, skippedReason: 'Acik irsaliye taslagi zaten var.' };

    const number = await generateDocumentNumber(tenantId, 'delivery_note', 'DN-', 'deliveryNote');
    const deliveryNote = await this.db.deliveryNote.create({
      data: {
        tenantId,
        number,
        type: DeliveryNoteType.OUTBOUND,
        status: DeliveryNoteStatus.DRAFT,
        salesOrderId: order.id,
        contactId: order.contactId,
        warehouseId,
        date: new Date(),
        notes: `${order.number} siparisinden otomatik taslak irsaliye`,
        createdById: userId,
        items: {
          create: order.items.map((item) => ({
            tenantId,
            productId: item.productId,
            description: item.description,
            orderedQty: item.quantity,
            deliveredQty: 0,
            salesOrderItemId: item.id,
            sortOrder: item.sortOrder,
          })),
        },
      },
      select: { id: true, number: true },
    });

    return { id: deliveryNote.id, number: deliveryNote.number, skippedReason: null };
  }

  private async ensureInvoiceDraft(
    tenantId: string,
    order: FulfillmentOrder,
    userId: string,
  ): Promise<{ id: string | null; number: string | null; skippedReason: string | null }> {
    const existing = await this.db.invoice.findFirst({
      where: {
        tenantId,
        salesOrderId: order.id,
        type: InvoiceType.SALES,
        deletedAt: null,
        status: { not: InvoiceStatus.CANCELLED },
      },
      select: { id: true, number: true },
    });
    if (existing) return { id: existing.id, number: existing.number, skippedReason: 'Acik fatura taslagi zaten var.' };

    const number = await generateDocumentNumber(tenantId, 'invoice', 'INV-', 'invoice');
    const invoiceDate = new Date();
    const dueDate = order.dueDate ?? addDays(invoiceDate, 30);
    const invoice = await this.db.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          tenantId,
          contactId: order.contactId,
          salesOrderId: order.id,
          type: InvoiceType.SALES,
          status: InvoiceStatus.DRAFT,
          number,
          date: invoiceDate,
          dueDate,
          currencyCode: order.currencyCode,
          exchangeRate: order.exchangeRate,
          totalNet: order.totalNet,
          totalTax: order.totalTax,
          totalGross: order.totalGross,
          notes: `${order.number} siparisinden otomatik taslak fatura`,
          createdById: userId,
          lines: {
            create: order.items.map((item) => ({
              tenantId,
              productId: item.productId,
              description: item.description ?? item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              taxAmount: item.taxAmount,
              lineTotal: item.lineTotal,
              sortOrder: item.sortOrder,
            })),
          },
        },
        select: { id: true, number: true },
      });

      await tx.invoiceHistory.create({
        data: {
          tenantId,
          invoiceId: newInvoice.id,
          toStatus: InvoiceStatus.DRAFT,
          notes: 'Otomatik satis akisi ile olusturuldu',
          createdById: userId,
        },
      });

      await writeInvoiceAccountEntry(tx, {
        tenantId,
        contactId: order.contactId,
        invoiceId: newInvoice.id,
        invoiceNumber: newInvoice.number,
        invoiceType: InvoiceType.SALES,
        totalGross: decimalToNumber(order.totalGross),
        date: invoiceDate,
        userId,
        reason: 'Otomatik satis akisi',
      });

      await tx.salesOrder.updateMany({
        where: { id: order.id, tenantId },
        data: { invoicedAmount: { increment: decimalToNumber(order.totalGross) } },
      });

      return newInvoice;
    });

    await domainEvents.publish({
      name: 'invoice.created',
      context: createEventContext({ tenantId, userId }),
      payload: {
        invoiceId: invoice.id,
        number: invoice.number,
        contactId: order.contact.id,
        contactName: order.contact.name,
        totalGross: decimalToNumber(order.totalGross),
        dueDate,
      },
    });

    return { id: invoice.id, number: invoice.number, skippedReason: null };
  }
}
