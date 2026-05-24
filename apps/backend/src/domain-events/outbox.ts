import { DomainEventOutboxStatus, Prisma } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import {
  entityIdForEvent,
  entityTypeForEvent,
  idempotencyKeyForEvent,
  sourceForEvent,
  type DomainEvent,
} from './events.js';

const MAX_ATTEMPTS = 3;

interface OutboxClaim {
  outboxId: string | null;
  shouldDispatch: boolean;
}

export interface DomainEventListenerFailure {
  listener: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function toJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toJson(item));
  if (isRecord(value)) {
    const output: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) output[key] = toJson(item);
    }
    return output;
  }
  return String(value);
}

function retryAt(attempts: number): Date {
  const delayMinutes = Math.min(60, Math.max(1, attempts) * 5);
  return new Date(Date.now() + delayMinutes * 60_000);
}

export async function claimDomainEvent(event: DomainEvent): Promise<OutboxClaim> {
  const idempotencyKey = idempotencyKeyForEvent(event);
  const existing = await prisma.domainEventOutbox.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: event.context.tenantId, idempotencyKey } },
    select: { id: true, status: true },
  });

  if (existing?.status === DomainEventOutboxStatus.PROCESSED || existing?.status === DomainEventOutboxStatus.PROCESSING) {
    return { outboxId: existing.id, shouldDispatch: false };
  }

  if (existing) {
    await prisma.domainEventOutbox.updateMany({
      where: { id: existing.id, tenantId: event.context.tenantId },
      data: {
        status: DomainEventOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
        lastError: null,
        failedListeners: Prisma.JsonNull,
        nextRetryAt: null,
      },
    });
    return { outboxId: existing.id, shouldDispatch: true };
  }

  const created = await prisma.domainEventOutbox.create({
    data: {
      tenantId: event.context.tenantId,
      name: event.name,
      source: sourceForEvent(event),
      idempotencyKey,
      entityType: entityTypeForEvent(event),
      entityId: entityIdForEvent(event),
      payload: toJson(event.payload) ?? Prisma.JsonNull,
      context: toJson(event.context) ?? Prisma.JsonNull,
      status: DomainEventOutboxStatus.PROCESSING,
      attempts: 1,
    },
    select: { id: true },
  });

  return { outboxId: created.id, shouldDispatch: true };
}

export async function markDomainEventProcessed(outboxId: string | null, tenantId: string): Promise<void> {
  if (!outboxId) return;
  await prisma.domainEventOutbox.updateMany({
    where: { id: outboxId, tenantId },
    data: {
      status: DomainEventOutboxStatus.PROCESSED,
      processedAt: new Date(),
      lastError: null,
      failedListeners: Prisma.JsonNull,
      nextRetryAt: null,
    },
  });
}

export async function markDomainEventFailed(outboxId: string | null, tenantId: string, failures: readonly DomainEventListenerFailure[]): Promise<void> {
  if (!outboxId) return;
  const current = await prisma.domainEventOutbox.findFirst({
    where: { id: outboxId, tenantId },
    select: { attempts: true },
  });
  const attempts = current?.attempts ?? MAX_ATTEMPTS;
  const status = attempts >= MAX_ATTEMPTS ? DomainEventOutboxStatus.DEAD_LETTER : DomainEventOutboxStatus.FAILED;
  const message = failures.map((failure) => `${failure.listener}: ${failure.message}`).join(' | ');

  await prisma.domainEventOutbox.updateMany({
    where: { id: outboxId, tenantId },
    data: {
      status,
      lastError: message.slice(0, 2000),
      failedListeners: toJson(failures) ?? Prisma.JsonNull,
      nextRetryAt: status === DomainEventOutboxStatus.FAILED ? retryAt(attempts) : null,
    },
  });
}

export async function safeClaimDomainEvent(event: DomainEvent): Promise<OutboxClaim> {
  try {
    return await claimDomainEvent(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen outbox hatasi';
    logger.error(`[DomainEventOutbox] ${event.name} kaydedilemedi: ${message}`);
    return { outboxId: null, shouldDispatch: true };
  }
}
