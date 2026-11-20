import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { renderProcessMetrics } from '../../application/observability/prometheus-exporter.js';
import { operationalMetrics } from '../../application/observability/operational-probe.js';
import { disasterRecoveryMetrics } from '../../application/observability/dr-metrics-file.js';
import { runtimeHealth } from '../../../../bootstrap/operations/runtime-health.js';

function authorized(context: Context): boolean {
  const expected = process.env.METRICS_BEARER_TOKEN;
  if (!expected || expected.length < 32 || expected.length > 4096) return false;
  const actual = /^Bearer\s+([^\s]+)$/i.exec(context.req.header('authorization') ?? '')?.[1] ?? '';
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export const MetricsController = {
  async prometheus(context: Context): Promise<Response> {
    if (process.env.METRICS_ENABLED === 'false') return context.text('Not Found', 404);
    if (!authorized(context)) return context.text('Unauthorized', 401);
    const [, operational, recovery] = await Promise.all([runtimeHealth.read(), operationalMetrics(prisma), disasterRecoveryMetrics()]);
    return context.text(renderProcessMetrics() + operational + recovery, 200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
    });
  },
};
