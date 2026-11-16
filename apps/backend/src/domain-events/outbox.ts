import { Prisma, DomainEventOutboxStatus } from '@prisma/client';
import { DOMAIN_EVENT_SCHEMA_VERSION, entityIdForEvent, entityTypeForEvent, idempotencyKeyForEvent, sourceForEvent, type DomainEvent } from './events.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

export function toDomainEventJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toDomainEventJson(item));
  if (isRecord(value)) {
    const output: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) output[key] = toDomainEventJson(item);
    }
    return output;
  }
  return String(value);
}

/** Durable intent only: callers must not execute external listeners inside the transaction. */
export async function enqueueDomainEvent(tx: Prisma.TransactionClient, event: DomainEvent): Promise<void> {
  await tx.domainEventOutbox.upsert({
    where: { tenantId: event.context.tenantId, tenantId_idempotencyKey: { tenantId: event.context.tenantId, idempotencyKey: idempotencyKeyForEvent(event) } },
    update: {},
    create: {
      tenantId: event.context.tenantId, name: event.name, schemaVersion: event.name === 'marketplace.webhook.received' || event.name === 'mail.delivery.requested' || event.name === 'edocument.delivery.requested' ? DOMAIN_EVENT_SCHEMA_VERSION : 1,
      source: sourceForEvent(event), idempotencyKey: idempotencyKeyForEvent(event),
      entityType: entityTypeForEvent(event), entityId: entityIdForEvent(event),
      payload: toDomainEventJson(event.payload) ?? Prisma.JsonNull, context: toDomainEventJson(event.context) ?? Prisma.JsonNull,
      status: DomainEventOutboxStatus.PENDING, attempts: 0,
    },
  });
}
