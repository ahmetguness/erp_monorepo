import { DomainEventOutboxStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { runWithTenantIsolationBypass } from '../../lib/tenant-isolation-context.js';
import { DOMAIN_EVENT_SCHEMA_VERSION } from '../events.js';
import { MAX_OUTBOX_ATTEMPTS, retryDelayMs } from './retry-policy.js';

export interface OutboxLease {
  id: string;
  tenantId: string;
  leaseOwner: string;
  attempts: number;
}

export const LEASE_DURATION_MS = 5 * 60_000;

function leaseDurationMs(): number {
  const configured = Number(process.env.DOMAIN_EVENT_OUTBOX_PROCESSING_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.min(30 * 60_000, Math.max(1_000, configured)) : LEASE_DURATION_MS;
}

export function claimNextEvent(tenantId?: string, id?: string, supportedSchemaVersion = DOMAIN_EVENT_SCHEMA_VERSION): Promise<OutboxLease | null> {
  return runWithTenantIsolationBypass('domain-event-outbox-worker-atomic-claim', async () => {
    const leaseOwner = randomUUID();
    const durationMs = leaseDurationMs();
    const tenantFilter = tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.empty;
    const idFilter = id ? Prisma.sql`AND id = ${id}` : Prisma.empty;
    const [lease] = await prisma.$queryRaw<OutboxLease[]>`
      WITH candidate AS (
        SELECT id FROM domain_event_outbox
        WHERE status IN ('PENDING', 'FAILED') AND attempts < ${MAX_OUTBOX_ATTEMPTS}
          AND "schemaVersion" <= ${Math.min(supportedSchemaVersion, DOMAIN_EVENT_SCHEMA_VERSION)}
          AND "quarantinedAt" IS NULL AND "resolvedAt" IS NULL
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
          ${tenantFilter} ${idFilter}
        ORDER BY "createdAt", id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE domain_event_outbox AS event
      SET status = 'PROCESSING', attempts = attempts + 1, "claimedAt" = NOW(),
          "leaseOwner" = ${leaseOwner}, "leaseExpiresAt" = NOW() + ${durationMs} * INTERVAL '1 millisecond', "updatedAt" = NOW()
      FROM candidate WHERE event.id = candidate.id
      RETURNING event.id, event."tenantId", event."leaseOwner", event.attempts
    `;
    return lease ?? null;
  });
}

export async function finishEvent(lease: OutboxLease): Promise<boolean> {
  const result = await prisma.domainEventOutbox.updateMany({
    where: { id: lease.id, tenantId: lease.tenantId, status: DomainEventOutboxStatus.PROCESSING, leaseOwner: lease.leaseOwner, leaseExpiresAt: { gt: new Date() } },
    data: {
      status: 'PROCESSED', processedAt: new Date(), lastError: null, failedListeners: Prisma.JsonNull,
      nextRetryAt: null, leaseOwner: null, leaseExpiresAt: null
    },
  });
  return result.count === 1;
}

export async function failEvent(lease: OutboxLease, failures: readonly { listener: string; message: string; }[], permanent = false, retryAfterMs = 0): Promise<void> {
  const exhausted = permanent || lease.attempts >= MAX_OUTBOX_ATTEMPTS;
  await prisma.domainEventOutbox.updateMany({
    where: { id: lease.id, tenantId: lease.tenantId, status: DomainEventOutboxStatus.PROCESSING, leaseOwner: lease.leaseOwner },
    data: {
      status: exhausted ? 'DEAD_LETTER' : 'FAILED',
      lastError: failures.map((failure) => `${failure.listener}: ${failure.message}`).join(' | ').slice(0, 2000),
      failedListeners: failures.map((failure) => ({ ...failure })),
      nextRetryAt: exhausted ? null : new Date(Date.now() + Math.max(retryAfterMs, retryDelayMs(lease.attempts))), leaseOwner: null, leaseExpiresAt: null
    },
  });
}

export function recoverExpiredLeases(): Promise<number> {
  return runWithTenantIsolationBypass('domain-event-outbox-worker-stale-processing', async () => {
    const stale = await prisma.domainEventOutbox.updateMany({
      where: {
        tenantId: { not: '' }, status: 'PROCESSING', OR: [
          { leaseExpiresAt: { lte: new Date() } },
          { leaseExpiresAt: null, updatedAt: { lte: new Date(Date.now() - leaseDurationMs()) } },
        ]
      },
      data: {
        status: 'FAILED', lastError: 'Worker lease expired before acknowledgment.',
        nextRetryAt: new Date(), leaseOwner: null, leaseExpiresAt: null
      },
    });
    await prisma.domainEventOutbox.updateMany({
      where: { tenantId: { not: '' }, status: { in: ['PENDING', 'FAILED'] }, attempts: { gte: MAX_OUTBOX_ATTEMPTS } },
      data: { status: 'DEAD_LETTER', nextRetryAt: null, leaseOwner: null, leaseExpiresAt: null },
    });
    await prisma.$executeRaw`
      UPDATE mail_messages AS mail SET status = 'FAILED', error = COALESCE(event."lastError", 'Delivery attempts exhausted.'), "updatedAt" = NOW()
      FROM domain_event_outbox AS event
      WHERE event.name = 'mail.delivery.requested' AND event.status = 'DEAD_LETTER'
        AND event.payload->>'mailId' = mail.id AND event."tenantId" = mail."tenantId" AND mail.status = 'PENDING'
    `;
    return stale.count;
  });
}
