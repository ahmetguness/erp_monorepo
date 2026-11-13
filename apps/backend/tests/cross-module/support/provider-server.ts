import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';

/** Only the external provider is simulated. ERP middleware, persistence and HTTP transport stay real. */
export async function startProviderServer() {
  let disconnected = false;
  let attempts = 0;
  const products: Array<{ barcode: string; stockCode: string; quantity: number }> = [];
  const server = createServer(async (request, response) => {
    attempts += 1;
    if (disconnected) { request.socket.destroy(); return; }
    if (request.method === 'POST' && request.url === '/integration/product/sellers/12345/products') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const payload: unknown = JSON.parse(Buffer.concat(chunks).toString());
        const input = z.object({ items: z.array(z.object({ barcode: z.string(), stockCode: z.string(), quantity: z.number() })) }).parse(payload);
        products.push(...input.items);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ batchRequestId: 'provider-batch-1' }));
      } catch {
        response.writeHead(400); response.end();
      }
      return;
    }
    response.writeHead(404); response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Provider TCP address is unavailable.');
  const previousBaseUrl = process.env.TRENDYOL_MOCK_BASE_URL;
  process.env.TRENDYOL_MOCK_BASE_URL = `http://127.0.0.1:${address.port}`;
  return {
    products,
    attempts: () => attempts,
    disconnect: () => { disconnected = true; },
    reconnect: () => { disconnected = false; },
    close: async () => {
      if (previousBaseUrl === undefined) delete process.env.TRENDYOL_MOCK_BASE_URL;
      else process.env.TRENDYOL_MOCK_BASE_URL = previousBaseUrl;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
