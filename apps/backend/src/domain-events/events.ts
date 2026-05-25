import { EntityType, Priority } from '@prisma/client';

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
