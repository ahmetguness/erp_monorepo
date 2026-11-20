import { z } from 'zod';
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{
    key: string;
    value: {
      stringValue: string;
    } | {
      intValue: string;
    };
  }>;
  status: {
    code: number;
  };
}
const configuration = z.object({ endpoint: z.url().refine(value => { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash; }), ratio: z.coerce.number().min(0).max(1) });
const responseSchema = z.object({ partialSuccess: z.object({ rejectedSpans: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional() }).optional() });
async function responseBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error('Missing telemetry acknowledgement');
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done)
        break;
      bytes += part.value.byteLength;
      if (bytes > 65536)
        throw new Error('Oversized telemetry acknowledgement');
      parts.push(part.value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }
  finally {
    await reader.cancel().catch(() => undefined);
  }
}
const queue: TraceSpan[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let flushing: Promise<void> | undefined;
let exported = 0, failures = 0, dropped = 0;
let cachedKey: string | undefined;
let cachedConfiguration: z.infer<typeof configuration> | null = null;
export function telemetryConfiguration() {
  if (process.env.TELEMETRY_ENABLED !== 'true')
    return null;
  const key = JSON.stringify([process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, process.env.TELEMETRY_SAMPLE_RATIO]);
  if (key === cachedKey)
    return cachedConfiguration;
  const result = configuration.safeParse({ endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, ratio: process.env.TELEMETRY_SAMPLE_RATIO ?? '0.1' });
  cachedKey = key;
  cachedConfiguration = result.success ? result.data : null;
  return cachedConfiguration;
}
export function enqueueSpan(span: TraceSpan): void {
  if (!telemetryConfiguration())
    return;
  if (queue.length >= 2048) {
    dropped++;
    return;
  }
  queue.push(span);
  if (!timer) {
    timer = setInterval(() => { void flushTraces(); }, 1000);
    timer.unref();
  }
}
export function flushTraces(): Promise<void> {
  if (flushing)
    return flushing;
  const config = telemetryConfiguration();
  if (!config || !queue.length)
    return Promise.resolve();
  const batch = queue.splice(0, 128);
  flushing = (async () => {
    try {
      const attributes = [{ key: 'service.name', value: { stringValue: process.env.APP_ROLE === 'worker' ? 'axon-worker' : 'axon-api' } }];
      const response = await fetch(config.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resourceSpans: [{ resource: { attributes }, scopeSpans: [{ scope: { name: 'axon.observability', version: '1' }, spans: batch }] }] }), signal: AbortSignal.timeout(1000), redirect: 'error' });
      if (response.status !== 200)
        throw new Error('Telemetry rejected');
      const body = await responseBody(response);
      const result = responseSchema.parse(body);
      const rejected = Number(result.partialSuccess?.rejectedSpans ?? 0);
      if (rejected > 0) {
        failures++;
        dropped += batch.length;
      }
      else
        exported += batch.length;
    }
    catch {
      failures++;
      dropped += batch.length;
    }
  })().finally(() => { flushing = undefined; });
  return flushing;
}
export function traceExporterMetrics() { return { axon_telemetry_exported_spans_total: exported, axon_telemetry_export_failures_total: failures, axon_telemetry_dropped_spans_total: dropped, axon_telemetry_queued_spans: queue.length, axon_telemetry_configuration_valid: process.env.TELEMETRY_ENABLED !== 'true' || telemetryConfiguration() !== null ? 1 : 0 }; }
