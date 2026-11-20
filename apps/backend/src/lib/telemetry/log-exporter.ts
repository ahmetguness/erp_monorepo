import { z } from 'zod';
import { countTelemetry } from './metrics.js';
const endpointSchema = z.url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
});
const queue: Array<[
  string,
  string
]> = [];
let timer: ReturnType<typeof setInterval> | undefined;
let pending: Promise<void> | undefined;
let lastTimestamp = 0n;
/** Receives only the already redacted JSON also written to stdout. */
export function exportDiagnosticLog(json: string): void {
  if (!process.env.LOG_EXPORT_ENDPOINT || !endpointSchema.safeParse(process.env.LOG_EXPORT_ENDPOINT).success)
    return;
  if (queue.length >= 512 || Buffer.byteLength(json) > 16384) {
    countTelemetry('axon_log_export_dropped_total');
    return;
  }
  const now = BigInt(Date.now()) * 1000000n;
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1n;
  queue.push([String(lastTimestamp), json]);
  if (!timer) {
    timer = setInterval(() => { void flushDiagnosticLogs(); }, 1000);
    timer.unref();
  }
}
export function flushDiagnosticLogs(): Promise<void> {
  if (pending)
    return pending;
  const endpoint = endpointSchema.safeParse(process.env.LOG_EXPORT_ENDPOINT);
  if (!endpoint.success || !queue.length)
    return Promise.resolve();
  const batch = queue.splice(0, 64);
  pending = (async () => {
    try {
      const response = await fetch(endpoint.data, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(1000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ streams: [{ stream: { service: process.env.APP_ROLE === 'worker' ? 'axon-worker' : 'axon-api' }, values: batch }] }),
      });
      await response.body?.cancel();
      if (response.status !== 204)
        throw new Error('Log export rejected');
      countTelemetry('axon_log_exported_total', batch.length);
    }
    catch {
      countTelemetry('axon_log_export_failures_total');
      countTelemetry('axon_log_export_dropped_total', batch.length);
    }
  })().finally(() => { pending = undefined; });
  return pending;
}
