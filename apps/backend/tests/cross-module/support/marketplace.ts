import { processDomainEventOutboxBatch } from '../../../src/services/domain-event-outbox-worker.service.js';
import { db } from './database.js';
import { createHmac } from 'node:crypto';
import { expect } from 'vitest';
import { z } from 'zod';
import { request } from './http.js';

const webhookResult = z.object({ ok: z.literal(true), processed: z.number(), duplicate: z.number(), failed: z.number(), results: z.array(z.object({ eventId: z.string() })) });

export async function signedWebhook(integrationId: string, secret: string, body: unknown) {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
  const response = await request('POST', `/api/public/trendyol/webhook/${integrationId}`, null, body, undefined,
    { 'x-timestamp': timestamp, 'x-signature': signature });
  expect(response.status, JSON.stringify(response.body)).toBe(202);
  const accepted = webhookResult.parse(response.body);
  await processDomainEventOutboxBatch(100);
  const records = await db.marketplaceWebhookEvent.findMany({ where: { integrationId, eventId: { in: accepted.results.map((item) => item.eventId) } } });
  return { ...accepted, processed: records.filter((record) => record.processedAt && !record.errorMessage).length, failed: records.filter((record) => record.errorMessage).length };
}
