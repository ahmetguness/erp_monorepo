import { expect, test, vi } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { storageService } from '../../../src/services/storage.service.js';
import { ChatRetentionWorker } from '../../../src/modules/storage-accounting/index.js';
import { processDomainEventOutboxBatch } from '../../../src/services/domain-event-outbox-worker.service.js';
import { enqueueDomainEvent } from '../../../src/domain-events/outbox.js';
import { createEventContext } from '../../../src/domain-events/events.js';
import { domainEvents } from '../../../src/domain-events/bus.js';

isolatedDatabase();

test('worker scaling: concurrent retention workers release attachment bytes only once', async () => {
  const { a } = await fixture();
  await db.tenantFeatureOverride.create({ data: { tenantId: a.tenant.id, featureKey: 'CHAT_RETENTION_DAYS', value: '1' } });
  const conversation = await db.chatConversation.create({ data: { tenantId: a.tenant.id, type: 'GROUP', createdById: a.owner.id } });
  const message = await db.chatMessage.create({ data: {
    tenantId: a.tenant.id, conversationId: conversation.id, senderId: a.owner.id, clientMessageId: 'phase7-expired', content: 'Expired synthetic message',
    createdAt: new Date(Date.now() - 3 * 86_400_000),
  } });
  const attachment = await db.chatAttachment.create({ data: {
    tenantId: a.tenant.id, uploaderId: a.owner.id, messageId: message.id, storageKey: 'phase7/expired.txt', originalName: 'expired.txt', safeDisplayName: 'expired.txt', mimeType: 'text/plain', sizeBytes: 100, kind: 'DOCUMENT', status: 'READY',
  } });
  await db.tenantStorageUsage.create({ data: { tenantId: a.tenant.id, usedBytes: 300n } });
  let calls = 0;
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const deletion = vi.spyOn(storageService, 'delete').mockImplementation(async () => { if (++calls >= 2) release(); await barrier; });
  try {
    await Promise.all([ChatRetentionWorker.processBatch(), ChatRetentionWorker.processBatch()]);
    expect(calls).toBe(2);
    expect((await db.tenantStorageUsage.findUniqueOrThrow({ where: { tenantId: a.tenant.id } })).usedBytes).toBe(200n);
    expect((await db.chatAttachment.findFirstOrThrow({ where: { id: attachment.id, tenantId: a.tenant.id } })).status).toBe('DELETED');
  } finally { deletion.mockRestore(); release(); }
});

test('worker drain: the current event is acknowledged while the next event remains unclaimed', async () => {
  const { a } = await fixture();
  for (const paymentId of ['phase7-first', 'phase7-second']) await db.$transaction((tx) => enqueueDomainEvent(tx, {
    name: 'payment.received', context: createEventContext({ tenantId: a.tenant.id, userId: a.owner.id }),
    payload: { paymentId, contactId: null, amount: 10, method: 'CASH', reference: null },
  }));
  let draining = false;
  const unsubscribe = domainEvents.subscribe('phase7-drain-signal', async () => { draining = true; });
  try {
    const result = await processDomainEventOutboxBatch(25, () => draining);
    expect(result.claimed).toBe(1);
    expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id, status: 'PROCESSED' } })).toBe(1);
    expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id, status: 'PENDING', attempts: 0, leaseOwner: null } })).toBe(1);
  } finally { unsubscribe(); }
});
