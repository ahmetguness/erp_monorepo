import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, request } from '../support/http.js';
import { withMailProvider } from '../support/mail-provider.js';
import { domainEvents } from '../../../src/domain-events/bus.js';
import { registerDomainEventListeners } from '../../../src/domain-events/listeners.js';
import { enqueueDomainEvent } from '../../../src/domain-events/outbox.js';
import { createEventContext } from '../../../src/domain-events/events.js';
import { restoreStoredEvent } from '../../../src/domain-events/event-codec.js';
import { claimNextEvent, finishEvent, failEvent, recoverExpiredLeases } from '../../../src/domain-events/delivery/repository.js';
import { dispatchClaimedEvent } from '../../../src/domain-events/delivery/dispatch.js';
import { processDomainEventOutboxBatch, replayDomainEventOutbox } from '../../../src/services/domain-event-outbox-worker.service.js';
import { queueMail } from '../../../src/services/mail-delivery/mail-delivery.service.js';
import { queueInvoiceDocument } from '../../../src/services/edocument/delivery-intent.js';
import { EDocumentAutomationService } from '../../../src/services/edocument-automation.service.js';
import { createTenantProvisioning, getTenantProvisioning, retryTenantProvisioning, processPendingTenantProvisioning } from '../../../src/modules/platform/tenant-provisioning/tenant-provisioning.service.js';
import { TrendyolWorker, processPendingJobs } from '../../../src/services/trendyol-worker.service.js';
import { completeProvisioningMail } from '../../../src/services/mail-delivery/provisioning-completion.js';
import { MODULE_KEY } from '@repo/types/plans';
import type { TenantProvisioningInput } from '@repo/types';

isolatedDatabase();

async function payment() {
  const { a, b } = await fixture();
  const id = await create('/api/payments', a.identity, {
    contactId: a.contact.id, cashAccountId: a.cash.id,
    amount: 10, date: '2026-11-16', method: 'CASH', direction: 'RECEIVE', idempotencyKey: 'phase6-async-payment'
  });
  const event = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, entityId: id, name: 'payment.received' } });
  return { a, b, id, event };
}
async function forceDue(tenantId: string, id: string) {
  await db.domainEventOutbox.updateMany({ where: { tenantId, id }, data: { nextRetryAt: new Date(0) } });
}

test('async: committed payment survives a stopped worker and two workers create one logical notification', async () => {
  const { a, event } = await payment();
  expect(event.status).toBe('PENDING');
  expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  await Promise.all([processDomainEventOutboxBatch(), processDomainEventOutboxBatch()]);
  expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('PROCESSED');
  expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.domainEventDelivery.count({ where: { tenantId: a.tenant.id, outboxId: event.id } })).toBe(3);
  expect((await processDomainEventOutboxBatch()).claimed).toBe(0);
});

test('async: business write rolls back when its durable intent cannot commit', async () => {
  const { a } = await fixture();
  await expect(db.$transaction(async (tx) => {
    await tx.contact.create({ data: { tenantId: a.tenant.id, code: 'ROLLBACK', name: 'Must not persist', type: 'CUSTOMER' } });
    await enqueueDomainEvent(tx, {
      name: 'payment.received', context: createEventContext({ tenantId: a.tenant.id }),
      payload: { paymentId: 'rollback-payment', contactId: a.contact.id, amount: 10, method: 'CASH', reference: null }
    });
    throw new Error('Injected process failure before commit.');
  })).rejects.toThrow('before commit');
  expect(await db.contact.count({ where: { tenantId: a.tenant.id, code: 'ROLLBACK' } })).toBe(0);
  expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id } })).toBe(0);
});

test('async: database receipts cannot reference an event belonging to a different tenant', async () => {
  const { a, b, event } = await payment();
  await expect(db.domainEventDelivery.create({ data: { tenantId: b.tenant.id, outboxId: event.id, consumer: 'forged' } })).rejects.toMatchObject({ code: 'P2003' });
  await processDomainEventOutboxBatch();
  expect(await db.domainEventDelivery.count({ where: { tenantId: a.tenant.id, outboxId: event.id } })).toBe(3);
  expect(await db.domainEventDelivery.count({ where: { tenantId: b.tenant.id } })).toBe(0);
});

test('async: a failed consumer rolls back its effect; replay skips completed consumers and respects tenant isolation', async () => {
  const { a, b, event } = await payment();
  registerDomainEventListeners();
  let reject = true;
  const unsubscribe = domainEvents.subscribe('phase6-failing-consumer', async (value, tx) => {
    await tx.task.create({ data: { tenantId: value.context.tenantId, title: 'Atomic consumer effect', source: 'phase6-consumer' } });
    if (reject) throw new Error('Injected transient consumer failure.');
  });
  try {
    await processDomainEventOutboxBatch();
    const failed = await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.nextRetryAt?.getTime()).toBeGreaterThan(Date.now());
    expect(await db.task.count({ where: { tenantId: a.tenant.id, source: 'phase6-consumer' } })).toBe(0);
    expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(1);
    expect((await request('POST', `/api/domain-events/${event.id}/replay`, b.identity)).status).toBe(404);
    reject = false;
    expect((await request('POST', `/api/domain-events/${event.id}/replay`, a.identity)).status).toBe(200);
    await processDomainEventOutboxBatch();
    expect(await db.task.count({ where: { tenantId: a.tenant.id, source: 'phase6-consumer' } })).toBe(1);
    expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(1);
    expect((await replayDomainEventOutbox(a.tenant.id, event.id, true))?.replayed).toBe(false);
  } finally { unsubscribe(); }
});

test('async: a crashed worker lease is recovered and its old owner cannot acknowledge or fail the new claim', async () => {
  const { a, event } = await payment();
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const shim = pathToFileURL(resolvePath(__dirname, '../../../../../scripts/node26-tsx-shim.mjs')).href;
    const child = spawn(process.execPath, ['--import', shim, '--import', 'tsx', resolvePath(__dirname, '../support/claim-and-exit.ts'), a.tenant.id],
      { env: { ...process.env }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code) => code === 88 ? resolve(code) : reject(new Error(`Crash harness exited with ${code}: ${stderr}`)));
  });
  expect(exitCode).toBe(88);
  const crashed = await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } });
  expect(crashed.status).toBe('PROCESSING');
  if (!crashed.leaseOwner) throw new Error('Missing crash lease token.');
  const oldLease = { id: crashed.id, tenantId: a.tenant.id, leaseOwner: crashed.leaseOwner, attempts: crashed.attempts };
  await db.domainEventOutbox.updateMany({ where: { id: event.id, tenantId: a.tenant.id }, data: { leaseExpiresAt: new Date(0) } });
  expect(await recoverExpiredLeases()).toBe(1);
  const lease = await claimNextEvent(a.tenant.id, event.id);
  if (!lease) throw new Error('Expected a recovered claim.');
  expect(lease.leaseOwner).not.toBe(oldLease.leaseOwner);
  expect(await finishEvent(oldLease)).toBe(false);
  await failEvent(oldLease, [{ listener: 'stale', message: 'Must not overwrite.' }], true);
  expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('PROCESSING');
  registerDomainEventListeners();
  expect(await dispatchClaimedEvent(restoreStoredEvent(event), lease)).toBe(true);
  expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(1);
});

test('async: repeated failure reaches dead letter and operator replay retains successful receipts', async () => {
  const { a, event } = await payment();
  const unsubscribe = domainEvents.subscribe('phase6-poison-consumer', async () => { throw new Error('Poison consumer.'); });
  try {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await forceDue(a.tenant.id, event.id);
      await processDomainEventOutboxBatch(1);
      const stored = await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.attempts).toBe(attempt);
      expect(stored.status).toBe(attempt === 5 ? 'DEAD_LETTER' : 'FAILED');
    }
    expect((await processDomainEventOutboxBatch()).claimed).toBe(0);
  } finally { unsubscribe(); }
  await replayDomainEventOutbox(a.tenant.id, event.id, true);
  await processDomainEventOutboxBatch();
  expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('PROCESSED');
  expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(1);
});

test('async: an acknowledgment failure after consumer commits does not duplicate their effects', async () => {
  const { a, event } = await payment();
  await db.$executeRawUnsafe(`CREATE FUNCTION phase6_fail_ack() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.name = 'payment.received' AND NEW.status = 'PROCESSED' THEN RAISE EXCEPTION 'phase6 injected acknowledgment failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER phase6_fail_ack BEFORE UPDATE ON domain_event_outbox FOR EACH ROW EXECUTE FUNCTION phase6_fail_ack()');
  try {
    await processDomainEventOutboxBatch();
    expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('FAILED');
    expect(await db.domainEventDelivery.count({ where: { tenantId: a.tenant.id, outboxId: event.id } })).toBe(3);
    expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER phase6_fail_ack ON domain_event_outbox');
    await db.$executeRawUnsafe('DROP FUNCTION phase6_fail_ack()');
  }
  await forceDue(a.tenant.id, event.id); await processDomainEventOutboxBatch();
  expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('PROCESSED');
  expect(await db.notification.count({ where: { tenantId: a.tenant.id } })).toBe(1);
});

test('async: mixed versions leave future envelopes untouched and accept additive legacy payloads', async () => {
  const { a, event } = await payment();
  await db.domainEventOutbox.updateMany({ where: { id: event.id, tenantId: a.tenant.id }, data: { schemaVersion: 3 } });
  expect(await claimNextEvent(a.tenant.id, event.id, 1)).toBeNull();
  expect((await processDomainEventOutboxBatch()).claimed).toBe(0);
  expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).attempts).toBe(0);
  expect(restoreStoredEvent({ ...event, payload: { paymentId: 'legacy', contactId: null, amount: 10, method: 'CASH', reference: null, futureField: true } }).name).toBe('payment.received');
  const queued = await queueMail({ tenantId: a.tenant.id, to: ['recipient@example.test'], subject: 'Mixed version', html: '<p>queued</p>' });
  const mailEvent = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, entityId: queued.id, name: 'mail.delivery.requested' } });
  expect(mailEvent.schemaVersion).toBe(2);
  expect(await claimNextEvent(a.tenant.id, mailEvent.id, 1)).toBeNull();
  expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: mailEvent.id } })).status).toBe('PENDING');
});

test('async: provider 500 and 429 retain the email snapshot and honor Retry-After before recovery', async () => {
  await withMailProvider(async (provider) => {
    const { a } = await fixture();
    const queued = await queueMail({
      tenantId: a.tenant.id, sentById: a.owner.id, to: ['recipient@example.test'], subject: 'Durable mail', html: '<p>Original</p>',
      attachments: [{ filename: 'evidence.txt', content: Buffer.from('attachment survives retries').toString('base64'), contentType: 'text/plain', sizeBytes: 27 }]
    });
    const event = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, entityId: queued.id } });
    provider.reply({ kind: 'status', status: 500 }); await processDomainEventOutboxBatch(1);
    expect((await db.mailMessage.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe('PENDING');
    await forceDue(a.tenant.id, event.id);
    provider.reply({ kind: 'status', status: 429, retryAfter: '60' }); const before = Date.now(); await processDomainEventOutboxBatch(1);
    expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).nextRetryAt?.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect((await processDomainEventOutboxBatch()).claimed).toBe(0);
    await forceDue(a.tenant.id, event.id); await processDomainEventOutboxBatch();
    expect((await db.mailMessage.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe('SENT');
    expect(provider.attempts).toHaveLength(3);
    expect(new Set(provider.attempts.map((item) => item.key)).size).toBe(1);
    expect(provider.attempts[2]?.payload).toMatchObject({ html: '<p>Original</p>', attachments: [{ filename: 'evidence.txt', content: Buffer.from('attachment survives retries').toString('base64') }] });
    expect(provider.delivered.size).toBe(1);
  });
});

test.each(['timeout', 'accept-disconnect'] as const)('async: provider %s recovers with one logical email', async (kind) => {
  await withMailProvider(async (provider) => {
    const { a } = await fixture();
    const mail = await queueMail({ tenantId: a.tenant.id, to: ['recipient@example.test'], subject: 'Ambiguous response', html: '<p>one delivery</p>' });
    const event = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, entityId: mail.id } });
    provider.reply({ kind }); await processDomainEventOutboxBatch(1);
    expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('FAILED');
    await forceDue(a.tenant.id, event.id); await processDomainEventOutboxBatch();
    expect((await db.mailMessage.findUniqueOrThrow({ where: { id: mail.id } })).status).toBe('SENT');
    expect(provider.attempts).toHaveLength(2);
    expect(provider.delivered.size).toBe(1);
  });
});

test.each([
  { errorCode: 'concurrent_idempotent_requests', retryable: true },
  { errorCode: 'resource_locked', retryable: true },
  { errorCode: 'invalid_idempotent_request', retryable: false },
  { errorCode: 'unknown_conflict', retryable: false },
])('async: provider 409 $errorCode preserves its retry semantics', async ({ errorCode, retryable }) => {
  await withMailProvider(async (provider) => {
    const { a } = await fixture();
    const mail = await queueMail({ tenantId: a.tenant.id, to: ['recipient@example.test'], subject: 'Conflict response', html: '<p>fixed payload</p>' });
    const event = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, entityId: mail.id } });
    provider.reply({ kind: 'status', status: 409, errorCode });
    await processDomainEventOutboxBatch(1);
    expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(retryable ? 'FAILED' : 'DEAD_LETTER');
    if (retryable) {
      await forceDue(a.tenant.id, event.id); await processDomainEventOutboxBatch();
      expect((await db.mailMessage.findUniqueOrThrow({ where: { id: mail.id } })).status).toBe('SENT');
      expect(provider.delivered.size).toBe(1);
    } else {
      await processDomainEventOutboxBatch();
      expect(provider.attempts).toHaveLength(1);
    }
  });
});

test('async: permanent 400 stops retrying and an expired ambiguous delivery requires reconciliation', async () => {
  await withMailProvider(async (provider) => {
    const { a } = await fixture();
    const mail = await queueMail({ tenantId: a.tenant.id, to: ['recipient@example.test'], subject: 'Permanent', html: '<p>stop</p>' });
    const event = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, entityId: mail.id } });
    provider.reply({ kind: 'status', status: 400 }); await processDomainEventOutboxBatch(1);
    expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('DEAD_LETTER');
    expect((await db.mailMessage.findUniqueOrThrow({ where: { id: mail.id } })).status).toBe('FAILED');
    await processDomainEventOutboxBatch(); expect(provider.attempts).toHaveLength(1);
    await db.mailMessage.updateMany({ where: { tenantId: a.tenant.id, id: mail.id }, data: { deliveryStartedAt: new Date(Date.now() - 24 * 60 * 60_000) } });
    await replayDomainEventOutbox(a.tenant.id, event.id, true); await processDomainEventOutboxBatch();
    expect(provider.attempts).toHaveLength(1);
    expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).lastError).toContain('reconciliation');
  });
});

test('async: an expired action email fails visibly without sending a stale link', async () => {
  await withMailProvider(async (provider) => {
    const { a } = await fixture();
    const mail = await queueMail({ tenantId: a.tenant.id, to: ['recipient@example.test'], subject: 'Expired action', html: '<p>expired link</p>', expiresAt: new Date(Date.now() - 1000) });
    await processDomainEventOutboxBatch();
    expect(provider.attempts).toHaveLength(0);
    expect((await db.mailMessage.findUniqueOrThrow({ where: { id: mail.id } })).status).toBe('FAILED');
  });
});

test('async: signed webhook is durable before acknowledgment and invalid or expired signatures create no intent', async () => {
  const { a } = await fixture();
  const secret = 'phase6-webhook-secret';
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Async webhook', channel: 'TRENDYOL', apiSecret: secret } });
  const body = { shipmentPackageId: 'phase6-package', status: 'Created', orderDate: Date.now(), lines: [] };
  const path = `/api/public/trendyol/webhook/${integration.id}`;
  for (const timestamp of [String(Date.now() - 6 * 60_000), 'invalid']) {
    const signature = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
    expect((await request('POST', path, null, body, undefined, { 'x-timestamp': timestamp, 'x-signature': signature })).status).toBe(401);
  }
  expect(await db.marketplaceWebhookEvent.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
  const response = await request('POST', path, null, body, undefined, { 'x-timestamp': timestamp, 'x-signature': signature });
  expect(response.status).toBe(202);
  expect(await db.marketplaceOrder.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id, name: 'marketplace.webhook.received', status: 'PENDING' } })).toBe(1);
});

test('async: document creation and delivery intent commit together and duplicate completion is harmless', async () => {
  const { a } = await fixture();
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, type: 'SALES', date: '2026-11-16', lines: [{ description: 'Service', quantity: 1, unitPrice: 10 }] });
  const document = await db.$transaction((tx) => queueInvoiceDocument(tx, a.tenant.id, invoiceId));
  expect(document.status).toBe('PROCESSING');
  expect((await db.eDocument.findUniqueOrThrow({ where: { id: document.id } })).acceptedAt).toBeNull();
  await processDomainEventOutboxBatch();
  expect((await db.eDocument.findUniqueOrThrow({ where: { id: document.id } })).status).toBe('ACCEPTED');
  expect((await new EDocumentAutomationService(db).processProviderCallback(a.tenant.id, document.id, { status: 'ACCEPTED' })).invoiceUpdated).toBe(false);
  expect(await db.eDocument.count({ where: { tenantId: a.tenant.id, invoiceId } })).toBe(1);
});

test.each(['CANCELLED', 'PAID'] as const)('async: a late document callback preserves the invoice %s state', async (status) => {
  const { a } = await fixture();
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, type: 'SALES', date: '2026-11-16', lines: [{ description: 'Service', quantity: 1, unitPrice: 10 }] });
  const document = await db.$transaction((tx) => queueInvoiceDocument(tx, a.tenant.id, invoiceId));
  await db.invoice.updateMany({ where: { tenantId: a.tenant.id, id: invoiceId }, data: { status } });
  const callback = await new EDocumentAutomationService(db).processProviderCallback(a.tenant.id, document.id, { status: 'ACCEPTED' });
  expect(callback.invoiceUpdated).toBe(false);
  expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe(status);
});

test('async: cancelling an invoice before queued document delivery prevents that dispatch', async () => {
  const { a } = await fixture();
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, type: 'SALES', date: '2026-11-16', lines: [{ description: 'Service', quantity: 1, unitPrice: 10 }] });
  const document = await db.$transaction((tx) => queueInvoiceDocument(tx, a.tenant.id, invoiceId));
  await db.invoice.updateMany({ where: { tenantId: a.tenant.id, id: invoiceId }, data: { status: 'CANCELLED' } });
  await processDomainEventOutboxBatch();
  expect((await db.eDocument.findUniqueOrThrow({ where: { id: document.id } })).status).toBe('ERROR');
  expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('CANCELLED');
});

const provisioningInput: TenantProvisioningInput = {
  companyName: 'Phase 6 Company', ownerName: 'Phase 6 Owner', email: 'phase6-owner@example.test',
  plan: 'STARTER', status: 'ACTIVE', modules: [MODULE_KEY.CONTACTS]
};

test('async: provisioning waits durably for its worker and only succeeds after owner email delivery', async () => {
  await withMailProvider(async (provider) => {
    await fixture();
    await db.adminUser.create({ data: { id: 'phase6-admin', name: 'Assurance admin', email: 'phase6-admin@example.test', password: 'non-login-fixture' } });
    const job = await createTenantProvisioning(provisioningInput, 'phase6-provisioning-job', 'phase6-admin');
    expect(job.status).toBe('PENDING'); expect(job.tenantId).toBeNull();
    provider.reply({ kind: 'status', status: 500 });
    await processDomainEventOutboxBatch();
    const running = await getTenantProvisioning(job.id);
    expect(running.status, running.error ?? '').toBe('RUNNING'); expect(running.tenantId).not.toBeNull();
    const tenantId = running.tenantId;
    if (!tenantId) throw new Error('Expected provisioned tenant.');
    const mail = await db.mailMessage.findFirstOrThrow({ where: { tenantId } });
    const event = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId, entityId: mail.id } });
    await forceDue(tenantId, event.id); await processDomainEventOutboxBatch();
    expect((await getTenantProvisioning(job.id)).status).toBe('SUCCEEDED');
    expect((await createTenantProvisioning(provisioningInput, 'phase6-provisioning-job', 'phase6-admin')).id).toBe(job.id);
    expect(await db.tenantUser.count({ where: { tenantId, isOwner: true } })).toBe(1);
    expect(await db.mailMessage.count({ where: { tenantId } })).toBe(1);
    expect(provider.delivered.size).toBe(1);
  });
});

test('async: provisioning email retry is tenant/attempt bound and old completion cannot finish the new attempt', async () => {
  await withMailProvider(async (provider) => {
    await fixture();
    await db.adminUser.create({ data: { id: 'phase6-admin', name: 'Assurance admin', email: 'phase6-admin@example.test', password: 'non-login-fixture' } });
    const job = await createTenantProvisioning(provisioningInput, 'phase6-provisioning-retry', 'phase6-admin');
    provider.reply({ kind: 'status', status: 400 }); await processDomainEventOutboxBatch();
    const failed = await getTenantProvisioning(job.id);
    expect(failed.status).toBe('FAILED');
    if (!failed.tenantId) throw new Error(`Expected retained tenant after mail failure: ${failed.error}`);
    await retryTenantProvisioning(job.id, 'phase6-admin');
    await db.$transaction((tx) => completeProvisioningMail(tx, failed.tenantId ?? '', { jobId: job.id, attempt: 1 }, true));
    expect((await getTenantProvisioning(job.id)).status).toBe('RUNNING');
    await processDomainEventOutboxBatch();
    expect((await getTenantProvisioning(job.id)).status).toBe('SUCCEEDED');
    expect(provider.delivered.size).toBe(1);
    expect(await db.tenant.count({ where: { email: provisioningInput.email } })).toBe(1);
  });
});

test('async: a crash on the last email lease ends the provisioning job instead of leaving it running forever', async () => {
  await withMailProvider(async (provider) => {
    await fixture();
    await db.adminUser.create({ data: { id: 'phase6-admin', name: 'Assurance admin', email: 'phase6-admin@example.test', password: 'non-login-fixture' } });
    const job = await createTenantProvisioning(provisioningInput, 'phase6-provisioning-crash', 'phase6-admin');
    await processPendingTenantProvisioning();
    const running = await getTenantProvisioning(job.id);
    if (!running.tenantId) throw new Error('Expected provisioned tenant.');
    const event = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: running.tenantId, name: 'mail.delivery.requested' } });
    await db.domainEventOutbox.updateMany({
      where: { id: event.id, tenantId: running.tenantId },
      data: { status: 'PROCESSING', attempts: 5, leaseOwner: 'crashed-worker', leaseExpiresAt: new Date(0) }
    });
    await processDomainEventOutboxBatch();
    expect((await getTenantProvisioning(job.id)).status).toBe('FAILED');
    expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('DEAD_LETTER');
    expect(provider.attempts).toHaveLength(0);
  });
});

test('async: concurrent marketplace workers claim one job and acknowledge it once', async () => {
  const { a } = await fixture();
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Worker integration', channel: 'TRENDYOL', storeId: '12345', apiKey: 'test-key', apiSecret: 'test-secret' } });
  const id = await TrendyolWorker.enqueue(a.tenant.id, integration.id, 'SYNC_STOCK');
  await Promise.all([processPendingJobs(a.tenant.id), processPendingJobs(a.tenant.id)]);
  const job = await db.marketplaceSyncJob.findUniqueOrThrow({ where: { id } });
  expect(job.status).toBe('DONE'); expect(job.attempts).toBe(1); expect(job.leaseOwner).toBeNull();
});

test('async: exhausted marketplace jobs and inactive integrations stop without an infinite retry loop', async () => {
  const { a } = await fixture();
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Inactive integration', channel: 'TRENDYOL', isActive: false } });
  const exhausted = await db.marketplaceSyncJob.create({ data: { tenantId: a.tenant.id, integrationId: integration.id, jobType: 'SYNC_STOCK', status: 'FAILED', attempts: 2, maxAttempts: 2 } });
  const inactiveId = await TrendyolWorker.enqueue(a.tenant.id, integration.id, 'SYNC_STOCK');
  await processPendingJobs(a.tenant.id);
  expect((await db.marketplaceSyncJob.findUniqueOrThrow({ where: { id: exhausted.id } })).status).toBe('DEAD_LETTER');
  const inactive = await db.marketplaceSyncJob.findUniqueOrThrow({ where: { id: inactiveId } });
  expect(inactive.status).toBe('DEAD_LETTER'); expect(inactive.attempts).toBe(1);
  await processPendingJobs(a.tenant.id);
  expect((await db.marketplaceSyncJob.findUniqueOrThrow({ where: { id: inactiveId } })).attempts).toBe(1);
});
