import { prisma } from '../../lib/prisma.js';
import { probeRedis, workerHeartbeat } from '../../lib/rateLimiter.js';
import { areWorkersHealthy, probeObjectStorage } from '../../modules/shared/index.js';
import { ReadinessMonitor, type ReadinessProbe } from './readiness.js';

const probes: ReadinessProbe[] = [{
  name: 'database',
  check: async () => { await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '2000ms'");
    await tx.$queryRaw`SELECT 1`;
    if (process.env.RELEASE_MIGRATION_VERSION) {
      const [schema] = await tx.$queryRaw<Array<{ ready: boolean }>>`
        SELECT EXISTS(SELECT 1 FROM _prisma_migrations WHERE migration_name = ${process.env.RELEASE_MIGRATION_VERSION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
          AND NOT EXISTS(SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS ready
      `;
      if (!schema?.ready) throw new Error('Release schema is not ready.');
    }
  }, { maxWait: 1_500, timeout: 2_500 }); },
}];
if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') probes.push({ name: 'redis', check: probeRedis });
if (process.env.NODE_ENV === 'production') probes.push({ name: 'objectStorage', check: probeObjectStorage });
if (process.env.APP_ROLE === 'worker' || process.env.APP_ROLE === 'all') {
  probes.push({ name: 'workers', check: async () => { if (!areWorkersHealthy()) throw new Error('Worker loops are not healthy.'); } });
} else if (process.env.REQUIRE_WORKER_READINESS === 'true') {
  probes.push({ name: 'workers', check: () => workerHeartbeat('check') });
}
export const runtimeHealth = new ReadinessMonitor(probes);
