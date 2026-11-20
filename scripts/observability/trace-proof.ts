import { z } from 'zod';
const spanSchema = z.object({ traceId: z.string().regex(/^[a-zA-Z0-9+/]+=*$/), spanId: z.string().regex(/^[a-zA-Z0-9+/]+=*$/), parentSpanId: z.string().optional(), name: z.string(), status: z.object({ code: z.string() }).optional() });
const traceSchema = z.object({ batches: z.array(z.object({ scopeSpans: z.array(z.object({ spans: z.array(spanSchema) })) })) });
/** Tempo's HTTP JSON encodes IDs as base64, unlike OTLP/HTTP ingestion hex. */
export function proveTraceGraph(value: unknown, traceId: string, required: readonly string[]): void {
  const spans = traceSchema.parse(value).batches.flatMap(batch => batch.scopeSpans.flatMap(scope => scope.spans));
  const ids = new Set(spans.map(span => span.spanId));
  if (!spans.length || ids.size !== spans.length)
    throw new Error('Missing or duplicate recorded spans');
  for (const span of spans) {
    if (Buffer.from(span.traceId, 'base64').toString('hex') !== traceId || Buffer.from(span.spanId, 'base64').length !== 8)
      throw new Error('Trace identity mismatch');
    if (span.parentSpanId && !ids.has(span.parentSpanId))
      throw new Error('Incomplete parent-child span graph');
  }
  for (const name of required)
    if (!spans.some(span => span.name === name))
      throw new Error('Required recorded span missing: ' + name);
  if (spans.filter(span => !span.parentSpanId).length !== 1)
    throw new Error('Expected one complete root trace');
}
export function proveFailedProviderTrace(value: unknown): void {
  const spans = traceSchema.parse(value).batches.flatMap(batch => batch.scopeSpans.flatMap(scope => scope.spans));
  if (!spans.some(span => span.name === 'provider.request' && span.status?.code === 'STATUS_CODE_ERROR'))
    throw new Error('Provider failure span not actually recorded');
}
