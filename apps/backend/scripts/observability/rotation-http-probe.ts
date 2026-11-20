import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { createApp } from '../../src/bootstrap/http/create-app.js';
import { readRuntimeConfig } from '../../src/bootstrap/runtime-config.js';
import { prisma } from '../../src/lib/prisma.js';
import { closeChatWebSockets, injectChatWebSocket } from '../../src/modules/collaboration/chat/infrastructure/realtime/node-websocket-gateway.js';
import { closeRateLimiter } from '../../src/lib/rateLimiter.js';
const casesSchema = z.array(z.object({ label: z.string().regex(/^[a-z-]{1,60}$/), path: z.enum(['/api/products', '/api/admin/auth/me']), token: z.string().max(4096), expectedStatus: z.union([z.literal(200), z.literal(401)]) })).min(1).max(10);
async function main(): Promise<void> {
  const url = new URL(process.env.CROSS_MODULE_DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || !/^phase3_[a-z0-9_]+_ci$/.test(url.pathname.slice(1)) || process.env.DATABASE_URL !== process.env.CROSS_MODULE_DATABASE_URL)
    throw new Error('Isolated rotation database required');
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 65536)
      throw new Error('Rotation input budget exceeded');
  }
  const cases = casesSchema.parse(JSON.parse(input));
  const app = createApp(readRuntimeConfig());
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  injectChatWebSocket(app, server);
  try {
    if (!server.listening)
      await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Rotation HTTP listener missing');
    const results = [];
    for (const item of cases) {
      const response = await fetch(`http://127.0.0.1:${address.port}` + item.path, { headers: { authorization: 'Bearer ' + item.token }, signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      results.push({ label: item.label, status: response.status, expected: item.expectedStatus });
    }
    process.stdout.write('AXON_ROTATION_RESULT=' + JSON.stringify(results) + '\n');
    if (results.some(row => row.status !== row.expected))
      process.exitCode = 1;
  }
  finally {
    await closeChatWebSockets(app);
    if ('closeAllConnections' in server)
      server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
    closeRateLimiter();
  }
}
main().catch(() => { console.error('Isolated HTTP rotation probe failed'); process.exitCode = 1; });
