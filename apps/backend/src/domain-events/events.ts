import { EntityType, Priority } from '@prisma/client';

export const DOMAIN_EVENT_SCHEMA_VERSION = 1;

export interface DomainEventContext {
  tenantId: string;
  userId?: string | null;
  correlationId?: string | null;
  occurredAt: Date;
}

export interface DomainEventPayloads {
  'invoice.created': {
    invoiceId: string;
    number: string;
    contactId: string;
    contactName: string;
    totalGross: number;
    dueDate: Date | null;
  };
  'invoice.overdue': {
    invoiceId: string;
    number: string;
    contactId: string;
    contactName: string;
    totalGross: number;
    dueDate: Date;
    daysLate: number;
  };
  'invoice.sent': {
    invoiceId: string;
    number: string;
    contactId: string;
    totalGross: number;
  };
  'invoice.paid': {
    invoiceId: string;
    number: string;
    contactId: string;
    paidAmount: number;
  };
  'payment.received': {
    paymentId: string;
    contactId: string | null;
    amount: number;
    method: string;
    reference: string | null;
  };
  'payment.allocated': {
    paymentId: string;
    invoiceId: string;
    amount: number;
  };
  'stock.low': {
    productId: string;
    productCode: string;
    productName: string;
    currentQuantity: number;
    minStockLevel: number;
    warehouseId: string | null;
  };
  'stock.reserved': {
    reservationId: string;
    productId: string;
    quantity: number;
    warehouseId: string;
  };
  'stock.reservation.released': {
    reservationId: string;
    productId: string;
    quantity: number;
    warehouseId: string;
  };
  'delivery.created': {
    deliveryNoteId: string;
    number: string;
    type: string;
    contactId: string | null;
  };
  'delivery.completed': {
    deliveryNoteId: string;
    number: string;
    type: string;
    contactId: string | null;
  };
  'sales.order.confirmed': {
    orderId: string;
    number: string;
    contactId: string;
    totalGross: number;
  };
  'sales.order.cancelled': {
    orderId: string;
    number: string;
    contactId: string;
    totalGross: number;
  };
  'salesQuote.accepted': {
    quoteId: string;
    orderId: string;
    quoteNumber: string;
    orderNumber: string;
    contactId: string;
    totalGross: number;
  };
  'purchase.request.created': {
    requestId: string;
    number: string;
    totalEstimated: number | null;
  };
  'purchase.order.approved': {
    orderId: string;
    number: string;
    contactId: string;
    totalGross: number;
  };
  'purchase.order.received': {
    orderId: string;
    number: string;
    receivedQuantity: number;
  };
  'supplier.invoice.created': {
    invoiceId: string;
    number: string;
    purchaseOrderId: string | null;
    totalGross: number;
  };
  'threeway.match.failed': {
    purchaseOrderId: string;
    purchaseOrderNumber: string;
    issueCount: number;
  };
  'accounting.entry.created': {
    journalEntryId: string;
    number: string;
    refType: string | null;
    refId: string | null;
    totalDebit: number;
    totalCredit: number;
  };
  'accounting.entry.failed': {
    refType: string;
    refId: string;
    reason: string;
  };
  'marketplace.order.received': {
    marketplaceOrderId: string;
    channel: string;
    totalGross: number;
  };
  'mail.failed': {
    mailId: string;
    subject: string;
    sentById: string | null;
    recipients: string[];
    error: string | null;
  };
  'employee.documentMissing': {
    employeeId: string;
    employeeName: string;
    documentName: string;
    severity: Priority;
  };
  'production.materialReserved': {
    workOrderId: string;
    workOrderNumber: string;
    reservedLineCount: number;
    reservedQuantity: number;
  };
  'production.completed': {
    workOrderId: string;
    workOrderNumber: string;
    productId: string;
    productName: string;
    plannedQty: number;
    producedQty: number;
    scrapQty: number;
  };
}

export type DomainEventName = keyof DomainEventPayloads;

export const DOMAIN_EVENT_NAMES = [
  'invoice.created',
  'invoice.overdue',
  'invoice.sent',
  'invoice.paid',
  'payment.received',
  'payment.allocated',
  'stock.low',
  'stock.reserved',
  'stock.reservation.released',
  'delivery.created',
  'delivery.completed',
  'sales.order.confirmed',
  'sales.order.cancelled',
  'salesQuote.accepted',
  'purchase.request.created',
  'purchase.order.approved',
  'purchase.order.received',
  'supplier.invoice.created',
  'threeway.match.failed',
  'accounting.entry.created',
  'accounting.entry.failed',
  'marketplace.order.received',
  'mail.failed',
  'employee.documentMissing',
  'production.materialReserved',
  'production.completed',
] as const satisfies readonly DomainEventName[];

export interface DomainEventPublishCoverageItem {
  workflow: string;
  eventName: DomainEventName;
  producer: string;
  status: 'covered' | 'planned';
  notes: string;
}

export const DOMAIN_EVENT_PUBLISH_COVERAGE = [
  {
    workflow: 'Satis siparisi onayi',
    eventName: 'sales.order.confirmed',
    producer: 'apps/backend/src/controllers/sales-order.controller.ts',
    status: 'planned',
    notes: 'Catalog ve listener hazir; confirm command publisher baglantisi Phase 7 sonrasi genisletilebilir.',
  },
  {
    workflow: 'Satis siparisi iptali',
    eventName: 'sales.order.cancelled',
    producer: 'apps/backend/src/controllers/sales-order.controller.ts',
    status: 'planned',
    notes: 'Catalog ve listener hazir; iptal command publisher baglantisi planli.',
  },
  {
    workflow: 'Fatura olusturma',
    eventName: 'invoice.created',
    producer: 'apps/backend/src/controllers/invoice.controller.ts',
    status: 'covered',
    notes: 'Fatura basariyla olustugunda audit/notification/outbox zincirine girer.',
  },
  {
    workflow: 'Geciken fatura tespiti',
    eventName: 'invoice.overdue',
    producer: 'scheduled/accounting health flow',
    status: 'planned',
    notes: 'Event tipi ve listener hazir; periyodik publisher kapsam raporunda planli gorunur.',
  },
  {
    workflow: 'Fatura gonderimi',
    eventName: 'invoice.sent',
    producer: 'invoice status flow',
    status: 'planned',
    notes: 'Fatura SENT durumuna gectiginde publish edilecek event tipi catalogda.',
  },
  {
    workflow: 'Fatura odendi',
    eventName: 'invoice.paid',
    producer: 'invoice status recompute flow',
    status: 'planned',
    notes: 'Odeme allocation sonrasi PAID durumuna geciste publish edilecek event tipi catalogda.',
  },
  {
    workflow: 'Tahsilat kaydi',
    eventName: 'payment.received',
    producer: 'apps/backend/src/services/payment.service.ts',
    status: 'covered',
    notes: 'Odeme/tahsilat kaydinda notification ve outbox standardi dogrulanir.',
  },
  {
    workflow: 'Odeme allocation',
    eventName: 'payment.allocated',
    producer: 'apps/backend/src/services/payment.service.ts',
    status: 'planned',
    notes: 'Allocation transaction icinde kalir; event sonraki workflow gorunurlugu icin kullanilir.',
  },
  {
    workflow: 'Kritik stok',
    eventName: 'stock.low',
    producer: 'apps/backend/src/controllers/stock.controller.ts',
    status: 'covered',
    notes: 'Stok hareketinden sonra minimum stok altina dusme durumunda uretilir.',
  },
  {
    workflow: 'Stok rezervasyonu',
    eventName: 'stock.reserved',
    producer: 'inventory reservation flow',
    status: 'planned',
    notes: 'Rezervasyon atomik kalir; event workflow gorunurlugu icin catalogda.',
  },
  {
    workflow: 'Stok rezervasyon serbest birakma',
    eventName: 'stock.reservation.released',
    producer: 'inventory reservation cleanup',
    status: 'planned',
    notes: 'Rezervasyon release publisher baglantisi planli.',
  },
  {
    workflow: 'Teslimat olusturma',
    eventName: 'delivery.created',
    producer: 'apps/backend/src/controllers/delivery-note.controller.ts',
    status: 'planned',
    notes: 'Irsaliye olustugunda workflow/audit zincirine baglanacak event tipi catalogda.',
  },
  {
    workflow: 'Teslimat tamamlanma',
    eventName: 'delivery.completed',
    producer: 'apps/backend/src/controllers/delivery-note.controller.ts',
    status: 'planned',
    notes: 'Teslimat tamamlandiginda sonraki fatura/stock gorevleri icin event tipi catalogda.',
  },
  {
    workflow: 'Tekliften siparise donusum',
    eventName: 'salesQuote.accepted',
    producer: 'apps/backend/src/controllers/sales-order.controller.ts',
    status: 'covered',
    notes: 'Teklif siparise donustugunde takip gorevi uretir.',
  },
  {
    workflow: 'Satinalma talebi',
    eventName: 'purchase.request.created',
    producer: 'apps/backend/src/controllers/purchase-order.controller.ts',
    status: 'planned',
    notes: 'Talep olustugunda approval/workflow gorunurlugu icin event tipi catalogda.',
  },
  {
    workflow: 'Satinalma siparisi onayi',
    eventName: 'purchase.order.approved',
    producer: 'purchase approval flow',
    status: 'planned',
    notes: 'Approval sonucu satinalma lifecycle event cataloguna dahil.',
  },
  {
    workflow: 'Satinalma teslim alma',
    eventName: 'purchase.order.received',
    producer: 'apps/backend/src/controllers/purchase-order.controller.ts',
    status: 'planned',
    notes: 'Teslim alma sonrasi invoice/three-way match isleri icin event tipi catalogda.',
  },
  {
    workflow: 'Tedarikci faturasi',
    eventName: 'supplier.invoice.created',
    producer: 'apps/backend/src/controllers/invoice.controller.ts',
    status: 'planned',
    notes: 'PURCHASE invoice olustugunda three-way match tetiklenebilir.',
  },
  {
    workflow: 'Three-way match istisnasi',
    eventName: 'threeway.match.failed',
    producer: 'apps/backend/src/services/purchase-three-way-match.service.ts',
    status: 'planned',
    notes: 'Match exception uretirse exception/workflow merkezine baglanacak event tipi catalogda.',
  },
  {
    workflow: 'Muhasebe fisi olustu',
    eventName: 'accounting.entry.created',
    producer: 'apps/backend/src/services/accounting-posting-engine.service.ts',
    status: 'covered',
    notes: 'Posting engine otomatik JournalEntry olusturdugunda outbox zincirine girer.',
  },
  {
    workflow: 'Muhasebe posting hatasi',
    eventName: 'accounting.entry.failed',
    producer: 'apps/backend/src/services/accounting-posting-engine.service.ts',
    status: 'covered',
    notes: 'Posting engine mapping veya denge hatasinda event uretir.',
  },
  {
    workflow: 'Marketplace siparisi alindi',
    eventName: 'marketplace.order.received',
    producer: 'marketplace sync flow',
    status: 'planned',
    notes: 'Marketplace import sonrasi fulfillment pipeline icin event tipi catalogda.',
  },
  {
    workflow: 'Mail gonderim hatasi',
    eventName: 'mail.failed',
    producer: 'apps/backend/src/services/mail-history.service.ts',
    status: 'covered',
    notes: 'Mail provider hatalari operasyonel bildirime ve outbox kaydina dusurulur.',
  },
  {
    workflow: 'Personel eksik evrak',
    eventName: 'employee.documentMissing',
    producer: 'hr document checklist flow',
    status: 'planned',
    notes: 'Event tipi ve listener hazir; HR evrak tarama publisher’i planli.',
  },
  {
    workflow: 'Uretim malzeme rezervasyonu',
    eventName: 'production.materialReserved',
    producer: 'apps/backend/src/controllers/work-order.controller.ts',
    status: 'covered',
    notes: 'Is emri baslatildiginda rezervasyon gorunurlugu saglar.',
  },
  {
    workflow: 'Uretim tamamlama',
    eventName: 'production.completed',
    producer: 'apps/backend/src/controllers/work-order.controller.ts',
    status: 'covered',
    notes: 'Is emri tamamlandiginda task/audit/outbox zincirine girer.',
  },
] as const satisfies readonly DomainEventPublishCoverageItem[];

export interface DomainEventListenerIdempotencyItem {
  listener: string;
  strategy: 'source-upsert' | 'append-only' | 'no-op-for-event' | 'natural-idempotency';
  notes: string;
}

export const DOMAIN_EVENT_LISTENER_IDEMPOTENCY = [
  {
    listener: 'auditListener',
    strategy: 'append-only',
    notes: 'Audit kaydi is gecmisi niteligindedir; replay sonrasi operasyonel incelemede event source ile izlenir.',
  },
  {
    listener: 'notificationListener',
    strategy: 'append-only',
    notes: 'Bildirimler kullanici gorunurlugu icin append-only tutulur; dead-letter replay operator onayi ile calisir.',
  },
  {
    listener: 'workflowListener',
    strategy: 'source-upsert',
    notes: 'Task uretiminde source alani kullanilir; tekrar isleme ayni tenant/source kaydini gunceller.',
  },
] as const satisfies readonly DomainEventListenerIdempotencyItem[];

export type DomainEvent = {
  [Name in DomainEventName]: {
    name: Name;
    context: DomainEventContext;
    payload: DomainEventPayloads[Name];
  }
}[DomainEventName];

export function createEventContext(input: Omit<DomainEventContext, 'occurredAt'> & { occurredAt?: Date }): DomainEventContext {
  return {
    ...input,
    occurredAt: input.occurredAt ?? new Date(),
  };
}

export function entityTypeForEvent(event: DomainEvent): EntityType {
  switch (event.name) {
    case 'invoice.created':
    case 'invoice.overdue':
    case 'invoice.sent':
    case 'invoice.paid':
    case 'supplier.invoice.created':
      return EntityType.INVOICE;
    case 'stock.low':
    case 'stock.reserved':
    case 'stock.reservation.released':
      return EntityType.PRODUCT;
    case 'delivery.created':
    case 'delivery.completed':
      return EntityType.DELIVERY_NOTE;
    case 'salesQuote.accepted':
      return EntityType.SALES_QUOTE;
    case 'sales.order.confirmed':
    case 'sales.order.cancelled':
      return EntityType.SALES_ORDER;
    case 'purchase.order.approved':
    case 'purchase.order.received':
    case 'threeway.match.failed':
      return EntityType.PURCHASE_ORDER;
    case 'employee.documentMissing':
      return EntityType.EMPLOYEE;
    case 'production.materialReserved':
    case 'production.completed':
      return EntityType.WORK_ORDER;
    case 'payment.received':
    case 'payment.allocated':
    case 'purchase.request.created':
    case 'accounting.entry.created':
    case 'accounting.entry.failed':
    case 'marketplace.order.received':
    case 'mail.failed':
      return EntityType.OTHER;
  }
}

export function entityIdForEvent(event: DomainEvent): string {
  switch (event.name) {
    case 'invoice.created':
    case 'invoice.overdue':
    case 'invoice.sent':
    case 'invoice.paid':
      return event.payload.invoiceId;
    case 'payment.received':
    case 'payment.allocated':
      return event.payload.paymentId;
    case 'stock.low':
    case 'stock.reserved':
    case 'stock.reservation.released':
      return event.payload.productId;
    case 'delivery.created':
    case 'delivery.completed':
      return event.payload.deliveryNoteId;
    case 'salesQuote.accepted':
      return event.payload.quoteId;
    case 'sales.order.confirmed':
    case 'sales.order.cancelled':
      return event.payload.orderId;
    case 'purchase.request.created':
      return event.payload.requestId;
    case 'purchase.order.approved':
    case 'purchase.order.received':
      return event.payload.orderId;
    case 'supplier.invoice.created':
      return event.payload.invoiceId;
    case 'threeway.match.failed':
      return event.payload.purchaseOrderId;
    case 'accounting.entry.created':
      return event.payload.journalEntryId;
    case 'accounting.entry.failed':
      return event.payload.refId;
    case 'marketplace.order.received':
      return event.payload.marketplaceOrderId;
    case 'mail.failed':
      return event.payload.mailId;
    case 'employee.documentMissing':
      return event.payload.employeeId;
    case 'production.materialReserved':
    case 'production.completed':
      return event.payload.workOrderId;
  }
}

export function sourceForEvent(event: DomainEvent): string {
  switch (event.name) {
    case 'invoice.created':
      return `domain:invoice.created:${event.payload.invoiceId}`;
    case 'invoice.overdue':
      return `domain:invoice.overdue:${event.payload.invoiceId}`;
    case 'invoice.sent':
      return `domain:invoice.sent:${event.payload.invoiceId}`;
    case 'invoice.paid':
      return `domain:invoice.paid:${event.payload.invoiceId}`;
    case 'payment.received':
      return `domain:payment.received:${event.payload.paymentId}`;
    case 'payment.allocated':
      return `domain:payment.allocated:${event.payload.paymentId}:${event.payload.invoiceId}`;
    case 'stock.low':
      return `domain:stock.low:${event.payload.productId}:${event.payload.warehouseId ?? 'all'}`;
    case 'stock.reserved':
      return `domain:stock.reserved:${event.payload.reservationId}`;
    case 'stock.reservation.released':
      return `domain:stock.reservation.released:${event.payload.reservationId}`;
    case 'delivery.created':
      return `domain:delivery.created:${event.payload.deliveryNoteId}`;
    case 'delivery.completed':
      return `domain:delivery.completed:${event.payload.deliveryNoteId}`;
    case 'sales.order.confirmed':
      return `domain:sales.order.confirmed:${event.payload.orderId}`;
    case 'sales.order.cancelled':
      return `domain:sales.order.cancelled:${event.payload.orderId}`;
    case 'salesQuote.accepted':
      return `domain:salesQuote.accepted:${event.payload.quoteId}`;
    case 'purchase.request.created':
      return `domain:purchase.request.created:${event.payload.requestId}`;
    case 'purchase.order.approved':
      return `domain:purchase.order.approved:${event.payload.orderId}`;
    case 'purchase.order.received':
      return `domain:purchase.order.received:${event.payload.orderId}:${event.payload.receivedQuantity}`;
    case 'supplier.invoice.created':
      return `domain:supplier.invoice.created:${event.payload.invoiceId}`;
    case 'threeway.match.failed':
      return `domain:threeway.match.failed:${event.payload.purchaseOrderId}:${event.payload.issueCount}`;
    case 'accounting.entry.created':
      return `domain:accounting.entry.created:${event.payload.journalEntryId}`;
    case 'accounting.entry.failed':
      return `domain:accounting.entry.failed:${event.payload.refType}:${event.payload.refId}:${event.payload.reason}`;
    case 'marketplace.order.received':
      return `domain:marketplace.order.received:${event.payload.marketplaceOrderId}`;
    case 'mail.failed':
      return `domain:mail.failed:${event.payload.mailId}`;
    case 'employee.documentMissing':
      return `domain:employee.documentMissing:${event.payload.employeeId}:${event.payload.documentName}`;
    case 'production.materialReserved':
      return `domain:production.materialReserved:${event.payload.workOrderId}`;
    case 'production.completed':
      return `domain:production.completed:${event.payload.workOrderId}:${event.payload.producedQty}:${event.payload.scrapQty}`;
  }
}

export function idempotencyKeyForEvent(event: DomainEvent): string {
  return sourceForEvent(event);
}
