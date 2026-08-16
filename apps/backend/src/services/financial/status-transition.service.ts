import { InvoiceStatus, OrderStatus } from '@prisma/client';
import { ValidationError } from '../../errors/index.js';

const INVOICE_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  [InvoiceStatus.DRAFT]: [InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
  [InvoiceStatus.SENT]: [InvoiceStatus.CANCELLED],
  [InvoiceStatus.PARTIALLY_PAID]: [InvoiceStatus.CANCELLED],
  [InvoiceStatus.OVERDUE]: [InvoiceStatus.CANCELLED],
  [InvoiceStatus.PAID]: [],
  [InvoiceStatus.CANCELLED]: [],
};

const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PARTIALLY_DELIVERED, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.PARTIALLY_DELIVERED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function assertInvoiceStatusTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (from === to) return;
  if (!INVOICE_TRANSITIONS[from].includes(to)) {
    throw new ValidationError(`Fatura durumu ${from} -> ${to} olarak manuel degistirilemez.`);
  }
}

export function assertSalesOrderStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return;
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new ValidationError(`Siparis durumu ${from} -> ${to} olarak degistirilemez.`);
  }
}

export function isComputedInvoiceStatus(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.PAID || status === InvoiceStatus.PARTIALLY_PAID || status === InvoiceStatus.OVERDUE;
}
