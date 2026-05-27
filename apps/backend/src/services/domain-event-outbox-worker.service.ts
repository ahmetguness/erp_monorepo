import { DomainEventOutboxStatus, Prisma, Priority } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { domainEvents } from '../domain-events';
import {
  DOMAIN_EVENT_NAMES,
  DOMAIN_EVENT_SCHEMA_VERSION,
  type DomainEvent,
  type DomainEventContext,
  type DomainEventName,
} from '../domain-events/events.js';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_POLL_INTERVAL_MS = 10_000;

interface StoredDomainEvent {
  id: string;
  tenantId: string;
  name: string;
  schemaVersion: number;
  payload: Prisma.JsonValue;
  context: Prisma.JsonValue;
  status: DomainEventOutboxStatus;
}

export interface DomainEventReplayResult {
  id: string;
  name: string;
  beforeStatus: DomainEventOutboxStatus;
  afterStatus: DomainEventOutboxStatus;
  attempts: number;
  replayed: boolean;
  message: string;
}

export interface DomainEventOutboxBatchResult {
  claimed: number;
  replayed: number;
  skipped: number;
  failed: number;
}

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
    userId: readOptionalString(value, 'userId'),
    correlationId: readOptionalString(value, 'correlationId'),
    occurredAt: readDate(value, 'occurredAt'),
  };
}

function readPayload(value: Prisma.JsonValue): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Event payload obje degil.');
  return value;
}

function restoreDomainEvent(name: DomainEventName, context: DomainEventContext, payload: Record<string, unknown>): DomainEvent {
  switch (name) {
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

function restoreStoredEvent(record: StoredDomainEvent): DomainEvent {
  if (!isDomainEventName(record.name)) throw new Error(`Bilinmeyen event adi: ${record.name}`);
  if (record.schemaVersion > DOMAIN_EVENT_SCHEMA_VERSION) {
    throw new Error(`Desteklenmeyen event schema version: ${record.schemaVersion}`);
  }
  return restoreDomainEvent(record.name, readContext(record.context), readPayload(record.payload));
}

async function loadOutboxEvent(tenantId: string, id: string): Promise<StoredDomainEvent | null> {
  return prisma.domainEventOutbox.findFirst({
    where: { tenantId, id },
    select: {
      id: true,
      tenantId: true,
      name: true,
      schemaVersion: true,
      payload: true,
      context: true,
      status: true,
    },
  });
}

export async function replayDomainEventOutbox(tenantId: string, id: string, includeDeadLetter: boolean): Promise<DomainEventReplayResult | null> {
  const record = await loadOutboxEvent(tenantId, id);
  if (!record) return null;

  if (record.status === DomainEventOutboxStatus.PROCESSING) {
    return {
      id: record.id,
      name: record.name,
      beforeStatus: record.status,
      afterStatus: record.status,
      attempts: 0,
      replayed: false,
      message: 'Event zaten PROCESSING durumunda.',
    };
  }

  if (record.status === DomainEventOutboxStatus.PROCESSED) {
    return {
      id: record.id,
      name: record.name,
      beforeStatus: record.status,
      afterStatus: record.status,
      attempts: 0,
      replayed: false,
      message: 'Event zaten PROCESSED durumunda.',
    };
  }

  if (record.status === DomainEventOutboxStatus.DEAD_LETTER && !includeDeadLetter) {
    return {
      id: record.id,
      name: record.name,
      beforeStatus: record.status,
      afterStatus: record.status,
      attempts: 0,
      replayed: false,
      message: 'Dead-letter event sadece manuel replay ile tekrar islenir.',
    };
  }

  await domainEvents.publish(restoreStoredEvent(record));
  const updated = await prisma.domainEventOutbox.findFirst({
    where: { tenantId, id },
    select: { status: true, attempts: true },
  });

  return {
    id: record.id,
    name: record.name,
    beforeStatus: record.status,
    afterStatus: updated?.status ?? record.status,
    attempts: updated?.attempts ?? 0,
    replayed: true,
    message: 'Event replay icin publish edildi.',
  };
}

export async function processDomainEventOutboxBatch(limit = DEFAULT_BATCH_SIZE): Promise<DomainEventOutboxBatchResult> {
  const dueEvents = await prisma.domainEventOutbox.findMany({
    where: {
      status: { in: [DomainEventOutboxStatus.PENDING, DomainEventOutboxStatus.FAILED] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true, tenantId: true },
  });

  const result: DomainEventOutboxBatchResult = { claimed: dueEvents.length, replayed: 0, skipped: 0, failed: 0 };
  for (const event of dueEvents) {
    try {
      const replay = await replayDomainEventOutbox(event.tenantId, event.id, false);
      if (replay?.replayed) result.replayed += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : 'Bilinmeyen outbox worker hatasi';
      logger.error(`[DomainEventOutboxWorker] ${event.id} replay hatasi: ${message}`);
      await prisma.domainEventOutbox.updateMany({
        where: { id: event.id, tenantId: event.tenantId },
        data: {
          status: DomainEventOutboxStatus.DEAD_LETTER,
          lastError: message.slice(0, 2000),
          nextRetryAt: null,
        },
      });
    }
  }

  return result;
}

class DomainEventOutboxWorkerService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(intervalMs = Number(process.env.DOMAIN_EVENT_OUTBOX_WORKER_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)): void {
    if (this.timer) return;
    logger.info(`[DomainEventOutboxWorker] Started. intervalMs=${intervalMs}`);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('[DomainEventOutboxWorker] Stopped.');
  }

  async tick(): Promise<DomainEventOutboxBatchResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const result = await processDomainEventOutboxBatch();
      if (result.claimed > 0) {
        logger.info('[DomainEventOutboxWorker] Batch processed', {
          claimed: result.claimed,
          replayed: result.replayed,
          skipped: result.skipped,
          failed: result.failed,
        });
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}

export const DomainEventOutboxWorker = new DomainEventOutboxWorkerService();
