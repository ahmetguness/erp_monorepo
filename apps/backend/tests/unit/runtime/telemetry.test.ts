import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseTraceparent, traceparent } from '../../../src/lib/telemetry/context.js';
import { safeSpanAttributes, withSpan } from '../../../src/lib/telemetry/tracing.js';
import { flushTraces, traceExporterMetrics } from '../../../src/lib/telemetry/exporter.js';
import { observeTelemetry, telemetryMetricsText } from '../../../src/lib/telemetry/metrics.js';
import { observedFetch } from '../../../src/modules/shared/infrastructure/observability/observed-fetch.js';
import { logger } from '../../../src/lib/logger.js';
import { redactSensitiveValue } from '../../../src/lib/sensitive-redaction.js';
import { diagnosticErrorFields } from '../../../src/lib/telemetry/error-fields.js';
const spanSchema = z.object({ traceId: z.string(), spanId: z.string(), parentSpanId: z.string().optional(), name: z.string(), status: z.object({ code: z.number() }), attributes: z.array(z.object({ key: z.string(), value: z.unknown() })) });
const batchSchema = z.object({ resourceSpans: z.array(z.object({ scopeSpans: z.array(z.object({ spans: z.array(spanSchema) })) })) });
const servers: Server[] = [];
async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  await flushTraces();
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); })));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('bounded operational telemetry', () => {
  it('rejects malformed/all-zero trace context and honors remote sampling', async () => {
    expect(parseTraceparent('00-' + '0'.repeat(32) + '-' + '1'.repeat(16) + '-01')).toBeNull();
    expect(parseTraceparent('bad\ncontext')).toBeNull();
    const parent = '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-00';
    await withSpan('test', 2, {}, async () => { expect(traceparent()).toMatch(/^00-a{32}-[a-f0-9]{16}-00$/); }, parent);
    expect(traceparent()).toBeUndefined();
  });
  it('exports real HTTP parent-child spans, errors and provider propagation without sensitive attributes', async () => {
    const spans: z.infer<typeof spanSchema>[] = [];
    let providerParent: string | undefined;
    const endpoint = await listen(createServer(async (request, response) => {
      if (request.url === '/provider') {
        providerParent = request.headers.traceparent?.toString();
        response.writeHead(500);
        response.end('{}');
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      for (const resource of batchSchema.parse(body).resourceSpans)
        for (const scope of resource.scopeSpans)
          spans.push(...scope.spans);
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    }));
    vi.stubEnv('TELEMETRY_ENABLED', 'true');
    vi.stubEnv('TELEMETRY_SAMPLE_RATIO', '1');
    vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', endpoint + '/v1/traces');
    await withSpan('http.request', 2, { 'http.route': '/test/:id', secret: 'hidden', tenantId: 'private' }, async () => {
      await observedFetch(endpoint + '/provider');
      await expect(withSpan('database.operation', 3, {}, async () => { throw new Error('sensitive provider body'); })).rejects.toThrow();
    });
    await flushTraces();
    const root = spans.find(span => span.name === 'http.request');
    const provider = spans.find(span => span.name === 'provider.request');
    const database = spans.find(span => span.name === 'database.operation');
    expect(root).toBeDefined();
    expect(provider?.parentSpanId).toBe(root?.spanId);
    expect(provider?.traceId).toBe(root?.traceId);
    expect(providerParent).toBe(`00-${provider?.traceId}-${provider?.spanId}-01`);
    expect(provider?.status.code).toBe(2);
    expect(database?.status.code).toBe(2);
    expect(JSON.stringify(spans)).not.toContain('hidden');
    expect(JSON.stringify(spans)).not.toContain('sensitive provider body');
    expect(safeSpanAttributes({ tenantId: 'private', 'http.route': '/test?token=private' })).toEqual([]);
  });
  it('fails closed on partial acknowledgements and keeps business operations successful during exporter failure', async () => {
    const endpoint = await listen(createServer((_request, response) => { response.setHeader('content-type', 'application/json'); response.end('{"partialSuccess":{"rejectedSpans":"1"}}'); }));
    vi.stubEnv('TELEMETRY_ENABLED', 'true');
    vi.stubEnv('TELEMETRY_SAMPLE_RATIO', '1');
    vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', endpoint);
    const before = traceExporterMetrics().axon_telemetry_export_failures_total;
    expect(await withSpan('finance.test', 1, {}, async () => 42)).toBe(42);
    await flushTraces();
    expect(traceExporterMetrics().axon_telemetry_export_failures_total).toBeGreaterThan(before);
    vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'http://127.0.0.1:1/v1/traces');
    expect(await withSpan('inventory.test', 1, {}, async () => 43)).toBe(43);
    await flushTraces();
    expect(traceExporterMetrics().axon_telemetry_queued_spans).toBe(0);
  });
  it('emits cumulative aggregatable histogram buckets and rejects invalid observations', () => {
    const labels = { route: '/telemetry-unit', method: 'GET', status: '200' };
    observeTelemetry('axon_http_request_duration_seconds', .09, labels);
    observeTelemetry('axon_http_request_duration_seconds', .4, labels);
    observeTelemetry('axon_http_request_duration_seconds', -1, labels);
    const metrics = telemetryMetricsText();
    expect(metrics).toContain('route="/telemetry-unit",method="GET",status="200",le="0.1"} 1');
    expect(metrics).toContain('route="/telemetry-unit",method="GET",status="200",le="0.5"} 2');
    expect(metrics).toContain('route="/telemetry-unit",method="GET",status="200",le="+Inf"} 2');
  });
  it('redacts PII, financial/body fields, prevents log injection and tolerates logging failure', () => {
    vi.stubEnv('LOG_FORMAT', 'json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.info('operation\nforged', { customerEmail: 'private@example.test', amount: 234.55, authorization: 'Bearer private', requestBody: 'private body', operation: 'test' });
    const output: unknown = JSON.parse(String(log.mock.calls[0]?.[0]));
    const parsed = z.object({ message: z.string(), amount: z.string(), customerEmail: z.string(), requestBody: z.string() }).parse(output);
    expect(parsed.message).toBe('operation forged');
    expect(parsed.amount).toBe('[REDACTED]');
    expect(parsed.customerEmail).toBe('[REDACTED]');
    expect(parsed.requestBody).toBe('[REDACTED]');
    const recursive: Record<string, unknown> = {};
    recursive.self = recursive;
    expect(() => redactSensitiveValue(recursive)).not.toThrow();
    log.mockImplementation(() => { throw new Error('Log sink unavailable'); });
    expect(() => logger.error('diagnostic')).not.toThrow();
  });
  it('classifies provider/AI failures without exporting raw bodies, signed URLs or opaque keys', () => {
    const failure = new Error('Private prompt and customer finance response');
    expect(diagnosticErrorFields(failure)).toEqual({ errorType: 'Error', errorCode: 'OPERATION_FAILED' });
    const invalid = z.number().safeParse('private@example.test');
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(diagnosticErrorFields(invalid.error)).toEqual({ errorType: 'ZodError', errorCode: 'OPERATION_FAILED' });
    const redacted = redactSensitiveValue({ message: 'redis://operator:private-key@localhost ' + 'a'.repeat(64) + ' https://example.test/file?X-Amz-Signature=private-signature\u2028forged', prompt: 'private prompt', customerName: 'private name', salary: 345.67 });
    const output = JSON.stringify(redacted);
    expect(output).not.toContain('private');
    expect(output).not.toContain('345.67');
    expect(output).not.toContain('\u2028');
  });
});
