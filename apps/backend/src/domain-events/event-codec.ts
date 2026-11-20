import { Priority, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { DOMAIN_EVENT_NAMES, DOMAIN_EVENT_SCHEMA_VERSION, type DomainEvent, type DomainEventContext, type DomainEventName } from './events.js';
import { PermanentDeliveryError, IncompatibleEventError } from './delivery/retry-policy.js';
import { parseTraceparent } from '../lib/telemetry/context.js';

export interface StoredDomainEvent {
  tenantId: string;
  name: string;
  schemaVersion: number;
  payload: Prisma.JsonValue;
  context: Prisma.JsonValue;
}

const mailDeliveryRequestSchema = z.object({
  mailId: z.string().min(1), expiresAt: z.iso.datetime().optional(),
  provisioning: z.object({ jobId: z.string().min(1), attempt: z.number().int().positive() }).optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDomainEventName(value: string): value is DomainEventName {
  return DOMAIN_EVENT_NAMES.some((name) => name === value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`${key} string degil.`);
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${key} string/null degil.`);
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} number degil.`);
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${key} string[] degil.`);
  }
  return value;
}

function readPriority(record: Record<string, unknown>, key: string): Priority {
  const value = readString(record, key);
  if (value === Priority.CRITICAL || value === Priority.HIGH || value === Priority.MEDIUM || value === Priority.LOW) {
    return value;
  }
  throw new Error(`${key} Priority enum degil.`);
}

function readDate(record: Record<string, unknown>, key: string): Date {
  const value = record[key];
  if (value instanceof Date) return value;
  if (typeof value !== 'string') throw new Error(`${key} tarih string degil.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${key} gecersiz tarih.`);
  return date;
}

function readOptionalDate(record: Record<string, unknown>, key: string): Date | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'string') throw new Error(`${key} tarih/null degil.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${key} gecersiz tarih.`);
  return date;
}

function readContext(value: Prisma.JsonValue): DomainEventContext {
  if (!isRecord(value)) throw new Error('Event context obje degil.');
  return {
    tenantId: readString(value, 'tenantId'),
    ...(value.eventId !== undefined ? { eventId: readString(value, 'eventId') } : {}),
    userId: readOptionalString(value, 'userId'),
    correlationId: readOptionalString(value, 'correlationId'),
    traceparent: typeof value.traceparent === 'string' && parseTraceparent(value.traceparent) ? value.traceparent : undefined,
    occurredAt: readDate(value, 'occurredAt'),
  };
}

function readPayload(value: Prisma.JsonValue): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Event payload obje degil.');
  return value;
}

function restoreDomainEvent(name: DomainEventName, context: DomainEventContext, payload: Record<string, unknown>): DomainEvent {
  switch (name) {
    case 'marketplace.webhook.received':
      return { name, context, payload: { webhookEventId: readString(payload, 'webhookEventId') } };
    case 'mail.delivery.requested':
      return { name, context, payload: mailDeliveryRequestSchema.parse(payload) };
    case 'edocument.delivery.requested':
      return { name, context, payload: { edocumentId: readString(payload, 'edocumentId'), retry: readNumber(payload, 'retry') } };
    case 'invoice.created':
      return {
        name,
        context,
        payload: {
          invoiceId: readString(payload, 'invoiceId'),
          number: readString(payload, 'number'),
          contactId: readString(payload, 'contactId'),
          contactName: readString(payload, 'contactName'),
          totalGross: readNumber(payload, 'totalGross'),
          dueDate: readOptionalDate(payload, 'dueDate'),
        },
      };
    case 'invoice.overdue':
      return {
        name,
        context,
        payload: {
          invoiceId: readString(payload, 'invoiceId'),
          number: readString(payload, 'number'),
          contactId: readString(payload, 'contactId'),
          contactName: readString(payload, 'contactName'),
          totalGross: readNumber(payload, 'totalGross'),
          dueDate: readDate(payload, 'dueDate'),
          daysLate: readNumber(payload, 'daysLate'),
        },
      };
    case 'invoice.sent':
      return {
        name,
        context,
        payload: {
          invoiceId: readString(payload, 'invoiceId'),
          number: readString(payload, 'number'),
          contactId: readString(payload, 'contactId'),
          totalGross: readNumber(payload, 'totalGross'),
        },
      };
    case 'invoice.paid':
      return {
        name,
        context,
        payload: {
          invoiceId: readString(payload, 'invoiceId'),
          number: readString(payload, 'number'),
          contactId: readString(payload, 'contactId'),
          paidAmount: readNumber(payload, 'paidAmount'),
        },
      };
    case 'payment.received':
      return {
        name,
        context,
        payload: {
          paymentId: readString(payload, 'paymentId'),
          contactId: readOptionalString(payload, 'contactId'),
          amount: readNumber(payload, 'amount'),
          method: readString(payload, 'method'),
          reference: readOptionalString(payload, 'reference'),
        },
      };
    case 'payment.allocated':
      return {
        name,
        context,
        payload: {
          paymentId: readString(payload, 'paymentId'),
          invoiceId: readString(payload, 'invoiceId'),
          amount: readNumber(payload, 'amount'),
        },
      };
    case 'stock.low':
      return {
        name,
        context,
        payload: {
          productId: readString(payload, 'productId'),
          productCode: readString(payload, 'productCode'),
          productName: readString(payload, 'productName'),
          currentQuantity: readNumber(payload, 'currentQuantity'),
          minStockLevel: readNumber(payload, 'minStockLevel'),
          warehouseId: readOptionalString(payload, 'warehouseId'),
        },
      };
    case 'stock.reserved':
    case 'stock.reservation.released':
      return {
        name,
        context,
        payload: {
          reservationId: readString(payload, 'reservationId'),
          productId: readString(payload, 'productId'),
          quantity: readNumber(payload, 'quantity'),
          warehouseId: readString(payload, 'warehouseId'),
        },
      };
    case 'delivery.created':
    case 'delivery.completed':
      return {
        name,
        context,
        payload: {
          deliveryNoteId: readString(payload, 'deliveryNoteId'),
          number: readString(payload, 'number'),
          type: readString(payload, 'type'),
          contactId: readOptionalString(payload, 'contactId'),
        },
      };
    case 'sales.order.confirmed':
    case 'sales.order.cancelled':
      return {
        name,
        context,
        payload: {
          orderId: readString(payload, 'orderId'),
          number: readString(payload, 'number'),
          contactId: readString(payload, 'contactId'),
          totalGross: readNumber(payload, 'totalGross'),
        },
      };
    case 'salesQuote.accepted':
      return {
        name,
        context,
        payload: {
          quoteId: readString(payload, 'quoteId'),
          orderId: readString(payload, 'orderId'),
          quoteNumber: readString(payload, 'quoteNumber'),
          orderNumber: readString(payload, 'orderNumber'),
          contactId: readString(payload, 'contactId'),
          totalGross: readNumber(payload, 'totalGross'),
        },
      };
    case 'purchase.request.created':
      return {
        name,
        context,
        payload: {
          requestId: readString(payload, 'requestId'),
          number: readString(payload, 'number'),
          totalEstimated: payload.totalEstimated === null || payload.totalEstimated === undefined ? null : readNumber(payload, 'totalEstimated'),
        },
      };
    case 'purchase.order.approved':
      return {
        name,
        context,
        payload: {
          orderId: readString(payload, 'orderId'),
          number: readString(payload, 'number'),
          contactId: readString(payload, 'contactId'),
          totalGross: readNumber(payload, 'totalGross'),
        },
      };
    case 'purchase.order.received':
      return {
        name,
        context,
        payload: {
          orderId: readString(payload, 'orderId'),
          number: readString(payload, 'number'),
          receivedQuantity: readNumber(payload, 'receivedQuantity'),
        },
      };
    case 'supplier.invoice.created':
      return {
        name,
        context,
        payload: {
          invoiceId: readString(payload, 'invoiceId'),
          number: readString(payload, 'number'),
          purchaseOrderId: readOptionalString(payload, 'purchaseOrderId'),
          totalGross: readNumber(payload, 'totalGross'),
        },
      };
    case 'threeway.match.failed':
      return {
        name,
        context,
        payload: {
          purchaseOrderId: readString(payload, 'purchaseOrderId'),
          purchaseOrderNumber: readString(payload, 'purchaseOrderNumber'),
          issueCount: readNumber(payload, 'issueCount'),
        },
      };
    case 'accounting.entry.created':
      return {
        name,
        context,
        payload: {
          journalEntryId: readString(payload, 'journalEntryId'),
          number: readString(payload, 'number'),
          refType: readOptionalString(payload, 'refType'),
          refId: readOptionalString(payload, 'refId'),
          totalDebit: readNumber(payload, 'totalDebit'),
          totalCredit: readNumber(payload, 'totalCredit'),
        },
      };
    case 'accounting.entry.failed':
      return {
        name,
        context,
        payload: {
          refType: readString(payload, 'refType'),
          refId: readString(payload, 'refId'),
          reason: readString(payload, 'reason'),
        },
      };
    case 'marketplace.order.received':
      return {
        name,
        context,
        payload: {
          marketplaceOrderId: readString(payload, 'marketplaceOrderId'),
          channel: readString(payload, 'channel'),
          totalGross: readNumber(payload, 'totalGross'),
        },
      };
    case 'mail.failed':
      return {
        name,
        context,
        payload: {
          mailId: readString(payload, 'mailId'),
          subject: readString(payload, 'subject'),
          sentById: readOptionalString(payload, 'sentById'),
          recipients: readStringArray(payload, 'recipients'),
          error: readOptionalString(payload, 'error'),
        },
      };
    case 'employee.documentMissing':
      return {
        name,
        context,
        payload: {
          employeeId: readString(payload, 'employeeId'),
          employeeName: readString(payload, 'employeeName'),
          documentName: readString(payload, 'documentName'),
          severity: readPriority(payload, 'severity'),
        },
      };
    case 'production.materialReserved':
      return {
        name,
        context,
        payload: {
          workOrderId: readString(payload, 'workOrderId'),
          workOrderNumber: readString(payload, 'workOrderNumber'),
          reservedLineCount: readNumber(payload, 'reservedLineCount'),
          reservedQuantity: readNumber(payload, 'reservedQuantity'),
        },
      };
    case 'production.completed':
      return {
        name,
        context,
        payload: {
          workOrderId: readString(payload, 'workOrderId'),
          workOrderNumber: readString(payload, 'workOrderNumber'),
          productId: readString(payload, 'productId'),
          productName: readString(payload, 'productName'),
          plannedQty: readNumber(payload, 'plannedQty'),
          producedQty: readNumber(payload, 'producedQty'),
          scrapQty: readNumber(payload, 'scrapQty'),
        },
      };
  }
}

export function restoreStoredEvent(record: StoredDomainEvent): DomainEvent {
  if (!isDomainEventName(record.name)) throw new PermanentDeliveryError(`Unknown event: ${record.name}`);
  if (record.schemaVersion > DOMAIN_EVENT_SCHEMA_VERSION) {
    throw new IncompatibleEventError(`Unsupported event schema: ${record.schemaVersion}`);
  }
  if (record.schemaVersion < 1) throw new PermanentDeliveryError('Invalid event schema version.');
  const context = readContext(record.context);
  if (context.tenantId !== record.tenantId) throw new PermanentDeliveryError('Event context tenant mismatch.');
  return restoreDomainEvent(record.name, context, readPayload(record.payload));
}
