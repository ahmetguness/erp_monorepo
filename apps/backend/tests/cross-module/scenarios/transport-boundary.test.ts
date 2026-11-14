import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { expect, test } from 'vitest';
import { createApp } from '../../../src/bootstrap/http/create-app.js';
import { readRuntimeConfig } from '../../../src/bootstrap/runtime-config.js';

test('security: the real Node adapter preserves authorization for normal and encoded private paths', async () => {
  const app = createApp(readRuntimeConfig());
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  try {
    if (!server.listening) await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP listener.');
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    for (const path of ['/api/products', '/api/payments', '/api/hr/employees']) {
      const response = await fetch(`${base}${path}`);
      await response.text();
      expect(response.status, path).toBe(401);
    }
    for (const path of ['/api/products/%0a', '/api/products%2F..%2Fcontacts']) {
      const response = await fetch(`${base}${path}`);
      await response.text();
      expect([400, 401, 403, 404], path).toContain(response.status);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
