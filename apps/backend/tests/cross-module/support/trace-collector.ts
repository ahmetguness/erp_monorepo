import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';

export const recordedSpanSchema = z.object({
  traceId: z.string().regex(/^[a-f0-9]{32}$/), spanId: z.string().regex(/^[a-f0-9]{16}$/),
  parentSpanId: z.string().optional(), name: z.string(), attributes: z.array(z.unknown()),
  status: z.object({ code: z.number().int() }),
});
const envelopeSchema = z.object({ resourceSpans: z.array(z.object({ scopeSpans: z.array(z.object({ spans: z.array(recordedSpanSchema) })) })) });

/** Only the collector is simulated; producer, DB, worker and provider HTTP are real. */
export async function withTraceCollector(measure: (collector: { endpoint: string; spans: z.infer<typeof recordedSpanSchema>[] }) => Promise<void>): Promise<void> {
  const spans: z.infer<typeof recordedSpanSchema>[] = [];
  let rejected = false;
  const server = createServer(async (request, response) => {
    try {
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const part of request) {
        const chunk: unknown = part;
        if (!Buffer.isBuffer(chunk)) throw new Error('Unexpected collector body chunk');
        bytes += chunk.length;
        if (bytes > 262144) throw new Error('Collector body budget exceeded');
        chunks.push(chunk);
      }
      const body = envelopeSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      for (const resource of body.resourceSpans)
        for (const scope of resource.scopeSpans) spans.push(...scope.spans);
      if (spans.length > 2048) throw new Error('Collector span budget exceeded');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    } catch {
      rejected = true;
      response.writeHead(400);
      response.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Collector did not bind loopback');
    await measure({ endpoint: `http://127.0.0.1:${address.port}/v1/traces`, spans });
    if (rejected) throw new Error('Actual OTLP envelope rejected');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
