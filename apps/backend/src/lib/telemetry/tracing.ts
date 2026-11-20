import { performance } from 'node:perf_hooks';
import { newSpanId, newTraceId, parseTraceparent, traceContext } from './context.js';
import { enqueueSpan, telemetryConfiguration, type TraceSpan } from './exporter.js';
type Attribute = string | number;
const keys = new Set(['http.request.method', 'http.route', 'http.response.status_code', 'db.system.name', 'db.operation.name', 'db.collection.name', 'messaging.operation.name', 'messaging.message.type', 'provider.name', 'error.type', 'operation.name']);
export function safeSpanAttributes(input: Readonly<Record<string, Attribute>>): TraceSpan['attributes'] {
  return Object.entries(input).filter(([key, value]) => keys.has(key) && (typeof value === 'number' ? Number.isSafeInteger(value) : value.length <= 160 && /^[a-zA-Z0-9_.*:/ -]+$/.test(value))).map(([key, value]) => ({ key, value: typeof value === 'number' ? { intValue: String(value) } : { stringValue: value } }));
}
export async function withSpan<T>(name: string, kind: 1 | 2 | 3 | 4 | 5, attributes: Readonly<Record<string, Attribute>>, operation: () => Promise<T>, remoteParent?: string | null): Promise<T> {
  const parent = remoteParent === undefined ? traceContext.getStore() : parseTraceparent(remoteParent);
  const config = telemetryConfiguration();
  // Unsampled nested operations need propagation only. Avoid allocating random
  // span IDs/ALS frames for every Prisma query when no span will be exported.
  if (remoteParent === undefined && ((parent && !parent.sampled) || (!parent && !config)))
    return operation();
  const context = { traceId: parent?.traceId ?? newTraceId(), spanId: newSpanId(), sampled: parent?.sampled ?? (config !== null && parseInt(newSpanId().slice(0, 8), 16) / 0x100000000 < config.ratio) };
  const started = performance.now();
  const unixStart = BigInt(Date.now()) * 1000000n;
  let failed = false;
  try {
    return await traceContext.run(context, operation);
  }
  catch (error) {
    failed = true;
    throw error;
  }
  finally {
    if (context.sampled && config) {
      enqueueSpan({ traceId: context.traceId, spanId: context.spanId, parentSpanId: parent?.spanId, name, kind, startTimeUnixNano: unixStart.toString(), endTimeUnixNano: (unixStart + BigInt(Math.round((performance.now() - started) * 1000000))).toString(), attributes: safeSpanAttributes(attributes), status: { code: failed || attributes['error.type'] !== undefined || Number(attributes['http.response.status_code'] ?? 0) >= 500 ? 2 : 1 } });
    }
  }
}
