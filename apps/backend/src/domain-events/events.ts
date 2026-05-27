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
  'payment.received': {
    paymentId: string;
    contactId: string | null;
    amount: number;
    method: string;
    reference: string | null;
  };
  'stock.low': {
    productId: string;
    productCode: string;
    productName: string;
    currentQuantity: number;
    minStockLevel: number;
    warehouseId: string | null;
  };
  'salesQuote.accepted': {
    quoteId: string;
    orderId: string;
    quoteNumber: string;
    orderNumber: string;
    contactId: string;
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
  'payment.received',
  'stock.low',
  'salesQuote.accepted',
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
    workflow: 'Tahsilat kaydi',
    eventName: 'payment.received',
    producer: 'apps/backend/src/services/payment.service.ts',
    status: 'covered',
    notes: 'Odeme/tahsilat kaydinda notification ve outbox standardi dogrulanir.',
  },
  {
    workflow: 'Kritik stok',
    eventName: 'stock.low',
    producer: 'apps/backend/src/controllers/stock.controller.ts',
    status: 'covered',
    notes: 'Stok hareketinden sonra minimum stok altina dusme durumunda uretilir.',
  },
  {
    workflow: 'Tekliften siparise donusum',
    eventName: 'salesQuote.accepted',
    producer: 'apps/backend/src/controllers/sales-order.controller.ts',
    status: 'covered',
    notes: 'Teklif siparise donustugunde takip gorevi uretir.',
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
      return EntityType.INVOICE;
    case 'stock.low':
      return EntityType.PRODUCT;
    case 'salesQuote.accepted':
      return EntityType.SALES_QUOTE;
    case 'employee.documentMissing':
      return EntityType.EMPLOYEE;
    case 'production.materialReserved':
    case 'production.completed':
      return EntityType.WORK_ORDER;
    case 'payment.received':
    case 'mail.failed':
      return EntityType.OTHER;
  }
}

export function entityIdForEvent(event: DomainEvent): string {
  switch (event.name) {
    case 'invoice.created':
    case 'invoice.overdue':
      return event.payload.invoiceId;
    case 'payment.received':
      return event.payload.paymentId;
    case 'stock.low':
      return event.payload.productId;
    case 'salesQuote.accepted':
      return event.payload.quoteId;
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
    case 'payment.received':
      return `domain:payment.received:${event.payload.paymentId}`;
    case 'stock.low':
      return `domain:stock.low:${event.payload.productId}:${event.payload.warehouseId ?? 'all'}`;
    case 'salesQuote.accepted':
      return `domain:salesQuote.accepted:${event.payload.quoteId}`;
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
