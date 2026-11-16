import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { TenantApi } from './tenant-api';
import { tenantSession } from './tenant-session';

interface SalesProcessScenario {
  api: TenantApi; db: PrismaClient; tenantId: string; orderId: string; productId: string; warehouseId: string;
}

export async function withSalesProcess(page: Page, verify: (scenario: SalesProcessScenario) => Promise<void>): Promise<void> {
  const { api, tenantId } = await tenantSession(page);
  const marker = `CROSS_MODULE_${randomUUID()}`;
  const db = new PrismaClient();
  let contactId: string | undefined;
  let productId: string | undefined;
  let warehouseId: string | undefined;
  try {
    contactId = await api.create('/api/contacts', { type: 'CUSTOMER', name: marker, code: marker });
    const units = await api.send('GET', '/api/master/units', z.array(z.object({ id: z.string() })));
    const unit = units[0];
    if (!unit) throw new Error('Browser fixture requires a unit.');
    productId = await api.create('/api/products', { code: marker, name: marker, unitId: unit.id, salesPrice: 100 });
    warehouseId = await api.create('/api/warehouses', { code: marker, name: marker });
    await api.create('/api/stock/movements', { idempotencyKey: randomUUID(), productId, warehouseId, type: 'IN', quantity: 10, unitCost: 40 });
    const orderId = await api.create('/api/sales-orders', { contactId, date: '2026-11-01', items: [{ productId, quantity: 2, unitPrice: 100 }] });
    const item = await db.salesOrderItem.findFirstOrThrow({ where: { tenantId, orderId } });
    const deliveryId = await api.create('/api/delivery-notes', { contactId, salesOrderId: orderId, warehouseId, type: 'OUTBOUND', date: '2026-11-01',
      items: [{ productId, orderedQty: 2, deliveredQty: 1, salesOrderItemId: item.id }] });
    await api.send('PATCH', `/api/delivery-notes/${deliveryId}/status`, z.unknown(), { status: 'DELIVERED' });
    const invoiceId = await api.create('/api/invoices', { contactId, salesOrderId: orderId, type: 'SALES', date: '2026-11-01',
      lines: [{ productId, description: marker, quantity: 1, unitPrice: 100 }] });
    await api.send('POST', `/api/invoices/${invoiceId}/approve`, z.unknown(), { idempotencyKey: randomUUID() });
    await api.create('/api/payments', { contactId, direction: 'RECEIVE', method: 'CASH', date: '2026-11-01', amount: 100,
      idempotencyKey: randomUUID(), allocations: [{ invoiceId, amount: 100 }] });
    await verify({ api, db, tenantId, orderId, productId, warehouseId });
  } finally {
    // Exact fixture ownership; never remove shared demo data.
    if (contactId) {
      const invoices = await db.invoice.findMany({ where: { tenantId, contactId }, select: { id: true } });
      const ids = invoices.map((invoice: { id: string }) => invoice.id);
      const payments = await db.payment.findMany({ where: { tenantId, contactId }, select: { id: true } });
      const refs = [...ids, ...payments.map((payment: { id: string }) => payment.id)];
      await db.paymentAllocation.deleteMany({ where: { tenantId, invoiceId: { in: ids } } });
      await db.payment.deleteMany({ where: { tenantId, contactId } });
      await db.journalEntryLine.deleteMany({ where: { tenantId, journalEntry: { tenantId, refId: { in: refs } } } });
      await db.journalEntry.deleteMany({ where: { tenantId, refId: { in: refs } } });
      await db.accountEntry.deleteMany({ where: { tenantId, contactId } });
      await db.invoiceHistory.deleteMany({ where: { tenantId, invoiceId: { in: ids } } });
      await db.invoiceLine.deleteMany({ where: { tenantId, invoiceId: { in: ids } } });
      await db.invoice.deleteMany({ where: { tenantId, contactId } });
      await db.deliveryNoteItem.deleteMany({ where: { tenantId, deliveryNote: { contactId } } });
      await db.deliveryNote.deleteMany({ where: { tenantId, contactId } });
      await db.salesOrderItem.deleteMany({ where: { tenantId, order: { contactId } } });
      await db.salesOrder.deleteMany({ where: { tenantId, contactId } });
      await db.contact.deleteMany({ where: { tenantId, id: contactId, name: marker } });
    }
    if (productId) {
      await db.stockValuation.deleteMany({ where: { tenantId, productId } });
      await db.stockMovement.deleteMany({ where: { tenantId, productId } });
      await db.stockLevel.deleteMany({ where: { tenantId, productId } });
      await db.product.deleteMany({ where: { tenantId, id: productId, name: marker } });
    }
    if (warehouseId) {
      await db.location.deleteMany({ where: { tenantId, warehouseId } });
      await db.warehouse.deleteMany({ where: { tenantId, id: warehouseId, name: marker } });
    }
    await db.$disconnect();
  }
}
