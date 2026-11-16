import { createServer } from 'node:http';
import { once } from 'node:events';

type Reply = { kind: 'status'; status: number; retryAfter?: string; errorCode?: string; } | { kind: 'timeout' | 'accept-disconnect' | 'success'; };

export async function startMailProvider() {
  const replies: Reply[] = [];
  const attempts: Array<{ key: string; payload: unknown; }> = [];
  const delivered = new Map<string, string>();
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const key = typeof request.headers['idempotency-key'] === 'string' ? request.headers['idempotency-key'] : '';
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    attempts.push({ key, payload });
    const reply = replies.shift() ?? { kind: 'success' };
    if (reply.kind === 'timeout') return;
    if (reply.kind === 'status') {
      response.writeHead(reply.status, { 'Content-Type': 'application/json', ...(reply.retryAfter ? { 'Retry-After': reply.retryAfter } : {}) });
      response.end(JSON.stringify({ message: 'Injected provider response.', ...(reply.errorCode ? { name: reply.errorCode } : {}) }));
      return;
    }
    const id = delivered.get(key) ?? `provider-mail-${delivered.size + 1}`;
    delivered.set(key, id);
    if (reply.kind === 'accept-disconnect') { request.socket.destroy(); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mail fixture did not bind a TCP port.');
  return {
    origin: `http://127.0.0.1:${address.port}`, attempts, delivered,
    reply(next: Reply) { replies.push(next); },
    async close() { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}

export async function withMailProvider(operation: (provider: Awaited<ReturnType<typeof startMailProvider>>) => Promise<void>): Promise<void> {
  const provider = await startMailProvider();
  const keys = ['MAIL_TEST_PROVIDER_ORIGIN', 'MAIL_TEST_TIMEOUT_MS', 'RESEND_API_KEY', 'MOCK_MAIL'] as const;
  const previous = keys.map((key) => process.env[key]);
  process.env.MAIL_TEST_PROVIDER_ORIGIN = provider.origin;
  process.env.MAIL_TEST_TIMEOUT_MS = '100';
  process.env.RESEND_API_KEY = 'test-key-local-provider-only';
  process.env.MOCK_MAIL = 'false';
  try { await operation(provider); }
  finally {
    keys.forEach((key, index) => { const value = previous[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; });
    await provider.close();
  }
}
