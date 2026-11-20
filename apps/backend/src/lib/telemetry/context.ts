import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}
export const traceContext = new AsyncLocalStorage<TraceContext>();
export function parseTraceparent(value: string | null | undefined): TraceContext | null {
  const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/.exec(value ?? '');
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2]))
    return null;
  return { traceId: match[1], spanId: match[2], sampled: (parseInt(match[3], 16) & 1) === 1 };
}
export function traceparent(context = traceContext.getStore()): string | undefined {
  return context ? `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}` : undefined;
}
export const newTraceId = () => randomBytes(16).toString('hex');
export const newSpanId = () => randomBytes(8).toString('hex');
