import { prisma } from '../../lib/prisma.js';
import { domainEvents } from '../bus.js';
import type { DomainEvent } from '../events.js';
import { failEvent, finishEvent, type OutboxLease } from './repository.js';
import { PermanentDeliveryError, LostOutboxLeaseError } from './retry-policy.js';

/** Each database consumer commits its effects and receipt in the same transaction. */
export async function dispatchClaimedEvent(event: DomainEvent, lease: OutboxLease): Promise<boolean> {
  const consumers = domainEvents.consumers();
  if (consumers.size === 0) throw new Error('No domain event consumers registered.');
  const failures: Array<{ listener: string; message: string; }> = [];
  let permanent = false;
  for (const [consumer, listener] of consumers) {
    try {
      await prisma.$transaction(async (tx) => {
        const [owned] = await tx.$queryRaw<Array<{ id: string; }>>`
          SELECT id FROM domain_event_outbox WHERE id = ${lease.id} AND "tenantId" = ${lease.tenantId}
            AND status = 'PROCESSING' AND "leaseOwner" = ${lease.leaseOwner} AND "leaseExpiresAt" > NOW() FOR UPDATE
        `;
        if (!owned) throw new LostOutboxLeaseError('Outbox claim is no longer owned.');
        const completed = await tx.domainEventDelivery.findUnique({
          where: { tenantId: lease.tenantId, tenantId_outboxId_consumer: { tenantId: lease.tenantId, outboxId: lease.id, consumer } },
        });
        if (completed) return;
        await listener(event, tx);
        await tx.domainEventDelivery.create({ data: { tenantId: lease.tenantId, outboxId: lease.id, consumer } });
      }, { timeout: 30_000 });
    } catch (error) {
      if (error instanceof LostOutboxLeaseError) return false;
      permanent ||= error instanceof PermanentDeliveryError;
      failures.push({ listener: consumer, message: error instanceof Error ? error.message : 'Consumer failed.' });
    }
  }
  if (failures.length) { await failEvent(lease, failures, permanent); return false; }
  return finishEvent(lease);
}
