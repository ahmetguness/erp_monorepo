import { createHmac } from 'node:crypto';
import { expect } from 'vitest';
import { z } from 'zod';
import { request } from './http.js';

const webhookResult = z.object({ ok: z.literal(true), processed: z.number(), duplicate: z.number(), failed: z.number() });

export async function signedWebhook(integrationId: string, secret: string, body: unknown) {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
  const response = await request('POST', `/api/public/trendyol/webhook/${integrationId}`, null, body, undefined,
    { 'x-timestamp': timestamp, 'x-signature': signature });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return webhookResult.parse(response.body);
}
