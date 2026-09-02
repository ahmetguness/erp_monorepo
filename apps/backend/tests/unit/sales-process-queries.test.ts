import { describe, expect, it } from 'vitest';
import { SalesProcessQueries } from '../../src/modules/sales/application/queries/sales-process.queries.js';
import type { SalesProcessReadRepository, SalesProcessSnapshot } from '../../src/modules/sales/application/ports/sales-process-read.repository.js';

function repositoryWith(snapshot: SalesProcessSnapshot | null): SalesProcessReadRepository {
  return { findByOrderId: async () => snapshot };
}

const baseSnapshot: SalesProcessSnapshot = {
  order: {
    id: 'order-1', number: 'SIP-1', status: 'DRAFT', createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dueDate: null, totalGross: 1_000, orderedQuantity: 10, deliveredQuantity: 0,
  },
  quote: null,
  deliveryNotes: [],
  invoices: [],
  payments: [],
};

describe('SalesProcessQueries', () => {
  it('taslak sipariş için birleşik akışı sıradaki aksiyon olarak önerir', async () => {
    const workspace = await new SalesProcessQueries(repositoryWith(baseSnapshot)).getWorkspace('tenant-1', 'order-1');
    expect(workspace?.nextAction.kind).toBe('FULFILL');
    expect(workspace?.progress).toEqual({ deliveryPercent: 0, invoicedPercent: 0, collectedPercent: 0 });
    expect(workspace?.blockers).toContain('Sipariş henüz onaylanmadı ve stok rezervasyonu yapılmadı.');
  });

  it('teslimat, fatura ve tahsilat tamamlandığında iş dosyasını tamamlanmış sayar', async () => {
    const completed: SalesProcessSnapshot = {
      ...baseSnapshot,
      order: { ...baseSnapshot.order, status: 'DELIVERED', deliveredQuantity: 10 },
      deliveryNotes: [{ id: 'delivery-1', number: 'IRS-1', status: 'DELIVERED', occurredAt: new Date('2026-01-02T00:00:00.000Z'), amount: null, collectedAmount: null }],
      invoices: [{ id: 'invoice-1', number: 'FAT-1', status: 'PAID', occurredAt: new Date('2026-01-03T00:00:00.000Z'), amount: 1_000, collectedAmount: 1_000 }],
      payments: [{ id: 'payment-1', number: 'TAH-1', status: 'COMPLETED', occurredAt: new Date('2026-01-04T00:00:00.000Z'), amount: 1_000, collectedAmount: null }],
    };
    const workspace = await new SalesProcessQueries(repositoryWith(completed)).getWorkspace('tenant-1', 'order-1');
    expect(workspace?.health).toBe('COMPLETED');
    expect(workspace?.nextAction.kind).toBe('NONE');
    expect(workspace?.timeline.map((stage) => stage.kind)).toEqual(['ORDER', 'DELIVERY', 'INVOICE', 'PAYMENT']);
  });

  it('başka tenantta bulunamayan sipariş için veri döndürmez', async () => {
    await expect(new SalesProcessQueries(repositoryWith(null)).getWorkspace('tenant-2', 'order-1')).resolves.toBeNull();
  });

  it('teslim edilmiş eski siparişte irsaliye referansı eksikse tamamlanmış teslimatı yeniden başlatmaz', async () => {
    const deliveredLegacyOrder: SalesProcessSnapshot = {
      ...baseSnapshot,
      order: { ...baseSnapshot.order, status: 'DELIVERED', deliveredQuantity: 10 },
    };
    const workspace = await new SalesProcessQueries(repositoryWith(deliveredLegacyOrder)).getWorkspace('tenant-1', 'order-1');
    expect(workspace?.nextAction.kind).toBe('INVOICE');
  });

  it('teslimat ve tahsilat aksiyonlarında hedef ekranın desteklediği parametreleri üretir', async () => {
    const awaitingDelivery: SalesProcessSnapshot = {
      ...baseSnapshot,
      order: { ...baseSnapshot.order, status: 'CONFIRMED', deliveredQuantity: 2 },
      deliveryNotes: [{ id: 'delivery-1', number: 'IRS-1', status: 'DRAFT', occurredAt: new Date('2026-01-02T00:00:00.000Z'), amount: null, collectedAmount: null }],
    };
    const deliveryWorkspace = await new SalesProcessQueries(repositoryWith(awaitingDelivery)).getWorkspace('tenant-1', 'order-1');
    expect(deliveryWorkspace?.nextAction.href).toBe('/dashboard/delivery-notes?salesOrderId=order-1');

    const awaitingCollection: SalesProcessSnapshot = {
      ...awaitingDelivery,
      order: { ...awaitingDelivery.order, status: 'DELIVERED', deliveredQuantity: 10 },
      invoices: [{ id: 'invoice-1', number: 'FAT-1', status: 'SENT', occurredAt: new Date('2026-01-03T00:00:00.000Z'), amount: 1_000, collectedAmount: 200 }],
    };
    const collectionWorkspace = await new SalesProcessQueries(repositoryWith(awaitingCollection)).getWorkspace('tenant-1', 'order-1');
    expect(collectionWorkspace?.nextAction.href).toBe('/dashboard/payments/new?invoiceId=invoice-1');
  });

  it('iptal edilmiş faturanın tahsilatını süreç ilerlemesine katmaz', async () => {
    const snapshot: SalesProcessSnapshot = {
      ...baseSnapshot,
      invoices: [{ id: 'invoice-1', number: 'FAT-1', status: 'CANCELLED', occurredAt: new Date('2026-01-03T00:00:00.000Z'), amount: 1_000, collectedAmount: 1_000 }],
    };
    const workspace = await new SalesProcessQueries(repositoryWith(snapshot)).getWorkspace('tenant-1', 'order-1');
    expect(workspace?.progress.collectedPercent).toBe(0);
  });
});
