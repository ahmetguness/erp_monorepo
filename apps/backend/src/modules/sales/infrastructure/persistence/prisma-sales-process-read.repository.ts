import type { PrismaClient } from '@prisma/client';
import type { SalesProcessDocumentRef, SalesProcessReadRepository, SalesProcessSnapshot } from '../../application/ports/sales-process-read.repository.js';

export class PrismaSalesProcessReadRepository implements SalesProcessReadRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByOrderId(tenantId: string, orderId: string): Promise<SalesProcessSnapshot | null> {
    const order = await this.db.salesOrder.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      select: {
        id: true, number: true, status: true, createdAt: true, dueDate: true, totalGross: true,
        quote: { select: { id: true, number: true, status: true, createdAt: true, totalGross: true } },
        items: { select: { quantity: true, delivered: true } },
        deliveryNotes: { where: { deletedAt: null }, select: { id: true, number: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        invoices: {
          where: { deletedAt: null }, orderBy: { createdAt: 'asc' },
          select: { id: true, number: true, status: true, createdAt: true, totalGross: true, payments: { select: { amount: true, payment: { select: { id: true, status: true, date: true, amount: true, reference: true } } } } },
        },
      },
    });
    if (!order) return null;

    const toRef = (item: { id: string; number: string; status: string; createdAt: Date; totalGross?: unknown }, collectedAmount: number | null = null): SalesProcessDocumentRef => ({
      id: item.id, number: item.number, status: item.status, occurredAt: item.createdAt,
      amount: item.totalGross === undefined ? null : Number(item.totalGross), collectedAmount,
    });
    const paymentMap = new Map<string, SalesProcessDocumentRef>();
    for (const invoice of order.invoices) {
      for (const allocation of invoice.payments) {
        const payment = allocation.payment;
        paymentMap.set(payment.id, { id: payment.id, number: payment.reference ?? payment.id, status: payment.status, occurredAt: payment.date, amount: Number(payment.amount), collectedAmount: null });
      }
    }

    return {
      order: {
        id: order.id, number: order.number, status: order.status, createdAt: order.createdAt, dueDate: order.dueDate,
        totalGross: Number(order.totalGross),
        orderedQuantity: order.items.reduce((sum, item) => sum + Number(item.quantity), 0),
        deliveredQuantity: order.items.reduce((sum, item) => sum + Number(item.delivered), 0),
      },
      quote: order.quote ? toRef(order.quote) : null,
      deliveryNotes: order.deliveryNotes.map((item) => toRef(item)),
      invoices: order.invoices.map((invoice) => toRef(
        invoice,
        invoice.payments
          .filter((allocation) => allocation.payment.status === 'COMPLETED')
          .reduce((sum, allocation) => sum + Number(allocation.amount), 0),
      )),
      payments: [...paymentMap.values()].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()),
    };
  }
}
