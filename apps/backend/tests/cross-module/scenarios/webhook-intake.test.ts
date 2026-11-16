import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import { processDomainEventOutboxBatch } from '../../../src/services/domain-event-outbox-worker.service.js';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { request } from '../support/http.js';
import { addStock } from '../support/invariants.js';

isolatedDatabase();

const secret = 'phase6-webhook-intake-secret';

async function webhookFixture() {
  const { a } = await fixture();
  const integration = await db.marketplaceIntegration.create({
    data: { tenantId: a.tenant.id, name: 'Webhook intake', channel: 'TRENDYOL', apiSecret: secret },
  });
  const body = {
    shipmentPackageId: 'phase6-intake-package', status: 'Created', orderDate: Date.now(),
    customerFirstName: 'Intake Customer', customerEmail: a.contact.email ?? 'intake@example.test', packageTotalPrice: 240,
    lines: [{ contentId: a.product.code, productName: a.product.name, quantity: 2, lineUnitPrice: 100, lineGrossAmount: 200 }],
  };
  return { a, integration, body };
}

function postWebhook(integrationId: string, body: unknown) {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
  return request('POST', `/api/public/trendyol/webhook/${integrationId}`, null, body, undefined, {
    'x-timestamp': timestamp, 'x-signature': signature,
  });
}

test('webhook intake: a failed durable write returns a retryable response and redelivery has one business effect', async () => {
  const { a, integration, body } = await webhookFixture();
  await addStock(a, 5);
  await db.$executeRawUnsafe(`CREATE FUNCTION phase6_fail_webhook_intake() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.name = 'marketplace.webhook.received' THEN RAISE EXCEPTION 'phase6 injected storage failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER phase6_fail_webhook_intake BEFORE INSERT ON domain_event_outbox FOR EACH ROW EXECUTE FUNCTION phase6_fail_webhook_intake()');
  try {
    const failed = await postWebhook(integration.id, body);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('Retry-After')).toBe('5');
    expect(failed.body).toMatchObject({ error: { code: 'WEBHOOK_UNAVAILABLE', message: 'Webhook could not be stored. Please retry.' } });
    expect(await db.marketplaceWebhookEvent.count({ where: { tenantId: a.tenant.id } })).toBe(0);
    expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id, name: 'marketplace.webhook.received' } })).toBe(0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER phase6_fail_webhook_intake ON domain_event_outbox');
    await db.$executeRawUnsafe('DROP FUNCTION phase6_fail_webhook_intake()');
  }
  expect((await postWebhook(integration.id, body)).status).toBe(202);
  expect((await postWebhook(integration.id, body)).status).toBe(202);
  await processDomainEventOutboxBatch(100);
  expect(await db.marketplaceWebhookEvent.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.marketplaceOrder.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.salesOrder.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, releasedAt: null } })).toBe(1);
});

test.each(['missing-fields', 'non-object', 'invalid-date'] as const)(
  'webhook intake: a batch containing %s is rejected before accepting any package',
  async (invalidKind) => {
    const { a, integration, body } = await webhookFixture();
    const invalid = invalidKind === 'non-object' ? null : invalidKind === 'missing-fields'
      ? { shipmentPackageId: 'invalid-package' }
      : { ...body, shipmentPackageId: 'invalid-date-package', orderDate: 1e20 };
    expect((await postWebhook(integration.id, { content: [body, invalid] })).status).toBe(400);
    expect(await db.marketplaceWebhookEvent.count({ where: { tenantId: a.tenant.id } })).toBe(0);
    expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id, name: 'marketplace.webhook.received' } })).toBe(0);
  },
);
