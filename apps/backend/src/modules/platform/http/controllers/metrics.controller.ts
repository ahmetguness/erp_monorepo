import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getObservabilitySnapshot } from '../../../../services/observability.service.js';
import { renderPrometheusMetrics } from '../../application/observability/prometheus-exporter.js';

function authorized(context: Context): boolean {
  const expected = process.env.METRICS_BEARER_TOKEN;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const actual = context.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export const MetricsController = {
  async prometheus(context: Context): Promise<Response> {
    if (process.env.METRICS_ENABLED === 'false') return context.text('Not Found', 404);
    if (!authorized(context)) return context.text('Unauthorized', 401);
    const snapshot = await getObservabilitySnapshot(prisma);
    return context.text(renderPrometheusMetrics(snapshot), 200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
    });
  },
};
