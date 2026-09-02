import type { SalesProcessDocumentRef, SalesProcessReadRepository, SalesProcessSnapshot } from '../ports/sales-process-read.repository.js';

export type SalesProcessHealth = 'HEALTHY' | 'AT_RISK' | 'BLOCKED' | 'COMPLETED';
export type SalesProcessStageKind = 'QUOTE' | 'ORDER' | 'DELIVERY' | 'INVOICE' | 'PAYMENT';

export interface SalesProcessWorkspace {
  caseId: string;
  health: SalesProcessHealth;
  progress: { deliveryPercent: number; invoicedPercent: number; collectedPercent: number };
  blockers: readonly string[];
  nextAction: { kind: 'FULFILL' | 'DELIVER' | 'INVOICE' | 'COLLECT' | 'NONE'; label: string; href: string | null };
  timeline: readonly {
    id: string;
    kind: SalesProcessStageKind;
    number: string;
    status: string;
    occurredAt: string;
    amount: number | null;
    href: string;
  }[];
}

function percent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
}

function documentStage(kind: SalesProcessStageKind, document: SalesProcessDocumentRef) {
  const href = kind === 'QUOTE' ? `/dashboard/sales-orders/quotes/${document.id}`
    : kind === 'INVOICE' ? `/dashboard/invoices/${document.id}`
      : kind === 'DELIVERY' ? `/dashboard/delivery-notes?deliveryNoteId=${document.id}`
        : `/dashboard/payments?paymentId=${document.id}`;
  return { ...document, kind, occurredAt: document.occurredAt.toISOString(), href };
}

function resolveWorkspace(snapshot: SalesProcessSnapshot): SalesProcessWorkspace {
  const { order } = snapshot;
  const invoiced = snapshot.invoices.filter((item) => item.status !== 'CANCELLED').reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const activeInvoices = snapshot.invoices.filter((item) => item.status !== 'CANCELLED');
  const collected = activeInvoices.reduce((sum, item) => sum + (item.collectedAmount ?? 0), 0);
  const deliveryPercent = percent(order.deliveredQuantity, order.orderedQuantity);
  const invoicedPercent = percent(invoiced, order.totalGross);
  const collectedPercent = percent(collected, order.totalGross);
  const blockers: string[] = [];
  const overdue = order.dueDate !== null && order.dueDate.getTime() < Date.now() && collectedPercent < 100;

  if (order.status === 'CANCELLED') blockers.push('Sipariş iptal edildi; süreç üzerinde yeni belge oluşturulamaz.');
  if (order.status === 'DRAFT') blockers.push('Sipariş henüz onaylanmadı ve stok rezervasyonu yapılmadı.');
  if (order.status !== 'DRAFT' && order.status !== 'CANCELLED' && deliveryPercent < 100) blockers.push(`Teslimatın %${100 - deliveryPercent} bölümü tamamlanmayı bekliyor.`);
  if (order.status !== 'CANCELLED' && invoicedPercent < 100) blockers.push(`Sipariş tutarının %${100 - invoicedPercent} bölümü faturalanmadı.`);
  if (invoicedPercent > 0 && collectedPercent < invoicedPercent) blockers.push(`Faturalanan tutarın tahsilatı tamamlanmadı.`);
  if (overdue) blockers.push('Tahsilat vadesi geçti.');

  const nextAction = order.status === 'CANCELLED'
    ? { kind: 'NONE' as const, label: 'Süreç kapalı', href: null }
    : order.status === 'DRAFT' || (snapshot.deliveryNotes.length === 0 && order.status !== 'DELIVERED')
      ? { kind: 'FULFILL' as const, label: 'Onayla, stoğu ayır ve taslakları oluştur', href: null }
      : deliveryPercent < 100 && order.status !== 'DELIVERED'
        ? { kind: 'DELIVER' as const, label: 'Teslimatı ilerlet', href: `/dashboard/delivery-notes?salesOrderId=${order.id}` }
        : invoicedPercent < 100
          ? { kind: 'INVOICE' as const, label: 'Kalan tutarı faturala', href: `/dashboard/invoices/new?salesOrderId=${order.id}` }
          : collectedPercent < 100
            ? {
                kind: 'COLLECT' as const,
                label: 'Tahsilat oluştur',
                href: `/dashboard/payments/new?invoiceId=${activeInvoices.find((invoice) => (invoice.collectedAmount ?? 0) < (invoice.amount ?? 0))?.id ?? activeInvoices[0]?.id ?? ''}`,
              }
            : { kind: 'NONE' as const, label: 'Süreç tamamlandı', href: null };

  const timeline = [
    ...(snapshot.quote ? [documentStage('QUOTE', snapshot.quote)] : []),
    { id: order.id, kind: 'ORDER' as const, number: order.number, status: order.status, occurredAt: order.createdAt.toISOString(), amount: order.totalGross, href: `/dashboard/sales-orders/${order.id}` },
    ...snapshot.deliveryNotes.map((item) => documentStage('DELIVERY', item)),
    ...snapshot.invoices.map((item) => documentStage('INVOICE', item)),
    ...snapshot.payments.map((item) => documentStage('PAYMENT', item)),
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  const completed = nextAction.kind === 'NONE' && order.status !== 'CANCELLED';
  const health: SalesProcessHealth = completed ? 'COMPLETED' : order.status === 'CANCELLED' || overdue ? 'BLOCKED' : blockers.length > 1 ? 'AT_RISK' : 'HEALTHY';
  return { caseId: `sales-order:${order.id}`, health, progress: { deliveryPercent, invoicedPercent, collectedPercent }, blockers, nextAction, timeline };
}

export class SalesProcessQueries {
  constructor(private readonly repository: SalesProcessReadRepository) {}

  async getWorkspace(tenantId: string, orderId: string): Promise<SalesProcessWorkspace | null> {
    const snapshot = await this.repository.findByOrderId(tenantId, orderId);
    return snapshot ? resolveWorkspace(snapshot) : null;
  }
}
