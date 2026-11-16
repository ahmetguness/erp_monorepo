import type { DomainEventOutboxStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface DomainEventReplayResult {
  id: string; name: string; beforeStatus: DomainEventOutboxStatus; afterStatus: DomainEventOutboxStatus;
  attempts: number; replayed: boolean; message: string;
}
/** Operator replay queues work; the API never executes consumers or provider calls. */
export async function replayDomainEventOutbox(tenantId: string, id: string, includeDeadLetter: boolean): Promise<DomainEventReplayResult | null> {
  const before = await prisma.domainEventOutbox.findFirst({ where: { tenantId, id } });
  if (!before) return null;
  const statuses: DomainEventOutboxStatus[] = includeDeadLetter ? ['FAILED', 'DEAD_LETTER'] : ['FAILED'];
  const changed = await prisma.domainEventOutbox.updateMany({
    where: { id, tenantId, status: { in: statuses }, quarantinedAt: null, resolvedAt: null },
    data: { status: 'PENDING', attempts: 0, nextRetryAt: null, leaseOwner: null, leaseExpiresAt: null },
  });
  return {
    id, name: before.name, beforeStatus: before.status, afterStatus: changed.count ? 'PENDING' : before.status,
    attempts: changed.count ? 0 : before.attempts, replayed: changed.count === 1,
    message: changed.count ? 'İş yeniden kuyruğa alındı.' : 'İşin mevcut durumu yeniden denemeye uygun değil.'
  };
}
