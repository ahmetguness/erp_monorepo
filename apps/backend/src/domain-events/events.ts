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
  }
}
