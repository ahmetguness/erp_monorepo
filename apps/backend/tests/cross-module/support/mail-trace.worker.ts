import { prisma } from '../../../src/lib/prisma.js';
import { processDomainEventOutboxBatch } from '../../../src/services/domain-event-outbox-worker.service.js';
import { flushTraces, traceExporterMetrics } from '../../../src/lib/telemetry/exporter.js';

async function main(): Promise<void> {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || process.env.CROSS_MODULE_MAIL_WORKER_PROBE !== 'true'
    || process.env.DATABASE_URL !== process.env.CROSS_MODULE_DATABASE_URL
    || !/^\/phase3_[a-z0-9_]+_ci$/.test(target.pathname)) throw new Error('Dedicated cross-module database required');
  try {
    const batch = await processDomainEventOutboxBatch();
    for (let attempt = 0; attempt < 20; attempt++) {
      await flushTraces();
      if (traceExporterMetrics().axon_telemetry_queued_spans === 0) break;
    }
    if (traceExporterMetrics().axon_telemetry_queued_spans !== 0) throw new Error('Worker trace flush budget exceeded');
    process.stdout.write('AXON_MAIL_WORKER_RESULT=' + JSON.stringify({ processId: process.pid, batch }) + '\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => { console.error('Owned mail trace worker failed'); process.exitCode = 1; });
