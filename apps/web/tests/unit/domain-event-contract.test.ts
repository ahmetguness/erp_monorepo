import { describe, expect, it } from 'vitest';
import { DomainEventCoverageSchema, DomainEventOutboxSchema } from '../../src/services/domain-event.service';
import { MailResultSchema } from '../../src/services/mail.service';

const legacy = {
  id: 'event-1', tenantId: 'tenant-a', name: 'payment.received', schemaVersion: 1, source: 'payment', idempotencyKey: 'payment-1',
  entityType: 'OTHER', entityId: 'payment-1', payload: {}, context: {}, status: 'FAILED', attempts: 1,
  lastError: 'Temporary failure', failedListeners: null, nextRetryAt: null, processedAt: null,
  createdAt: '2026-11-16T12:00:00Z', updatedAt: '2026-11-16T12:00:00Z',
};

describe('async operation API compatibility', () => {
  it('accepts legacy API rows during a rolling upgrade with empty delivery details', () => {
    const row = DomainEventOutboxSchema.parse(legacy);
    expect(row.deliveries).toEqual([]);
    expect(row.leaseExpiresAt).toBeNull();
  });
  it('accepts new consumer receipts and rejects unknown job status values', () => {
    expect(DomainEventOutboxSchema.parse({ ...legacy, deliveries: [{ consumer: 'notificationListener-v1', completedAt: legacy.createdAt }] }).deliveries).toHaveLength(1);
    expect(DomainEventOutboxSchema.safeParse({ ...legacy, status: 'SUCCESS' }).success).toBe(false);
    expect(DomainEventCoverageSchema.safeParse({ schemaVersion: 2, publishCoverage: [], listenerIdempotency: [{ listener: 'notification', strategy: 'transactional-receipt', notes: 'Atomic receipt.' }] }).success).toBe(true);
  });
  it('preserves the distinction between accepting an email and delivering it', () => {
    expect(MailResultSchema.parse({ success: true, queued: true, id: 'mail-1' }).queued).toBe(true);
    expect(MailResultSchema.parse({ success: true, id: 'legacy-provider-id' }).queued).toBeUndefined();
  });
});
