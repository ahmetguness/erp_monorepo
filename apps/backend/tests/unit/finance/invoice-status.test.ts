import { InvoiceStatus, OrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { computeInvoiceStatus } from '../../../src/services/financial/invoice-status.service.js';
import {
  assertInvoiceStatusTransition,
  assertSalesOrderStatusTransition,
  isComputedInvoiceStatus,
} from '../../../src/services/financial/status-transition.service.js';

describe('invoice financial rules', () => {
  const asOf = new Date('2026-08-27T12:00:00.000Z');

  it.each([
    [InvoiceStatus.SENT, [], null, InvoiceStatus.SENT],
    [InvoiceStatus.SENT, [{ amount: 40 }], null, InvoiceStatus.PARTIALLY_PAID],
    [InvoiceStatus.SENT, [{ amount: 100 }], null, InvoiceStatus.PAID],
    [InvoiceStatus.SENT, [], new Date('2026-08-01'), InvoiceStatus.OVERDUE],
    [InvoiceStatus.CANCELLED, [{ amount: 100 }], null, InvoiceStatus.CANCELLED],
  ])('computes %s invoice status as %s', (status, payments, dueDate, expected) => {
    expect(computeInvoiceStatus({ totalGross: 100, status, payments, dueDate }, asOf).status).toBe(expected);
  });

  it('accepts valid manual transitions and rejects computed transitions', () => {
    expect(() => assertInvoiceStatusTransition(InvoiceStatus.DRAFT, InvoiceStatus.SENT)).not.toThrow();
    expect(() => assertInvoiceStatusTransition(InvoiceStatus.SENT, InvoiceStatus.PAID)).toThrow();
    expect(isComputedInvoiceStatus(InvoiceStatus.PAID)).toBe(true);
    expect(isComputedInvoiceStatus(InvoiceStatus.SENT)).toBe(false);
  });

  it('enforces sales order lifecycle', () => {
    expect(() => assertSalesOrderStatusTransition(OrderStatus.DRAFT, OrderStatus.CONFIRMED)).not.toThrow();
    expect(() => assertSalesOrderStatusTransition(OrderStatus.DELIVERED, OrderStatus.DRAFT)).toThrow();
  });
});
