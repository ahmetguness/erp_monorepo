import { prisma } from '../../lib/prisma.js';
import { closeRateLimiter } from '../../lib/rateLimiter.js';
import { logger } from '../../lib/logger.js';
import { stopWorkers } from '../workers.js';
import { runtimeHealth } from './runtime-health.js';
import { ProcessLifecycle } from './lifecycle.js';

export function registerShutdown(stopAccepting: () => Promise<void>, forceClose: () => void, beforeStop: () => void = () => {}): void {
  const lifecycle = new ProcessLifecycle({
    drain: () => { runtimeHealth.beginDrain(); beforeStop(); },
    stopAccepting,
    stopWorkers,
    disconnect: async () => { closeRateLimiter(); await prisma.$disconnect(); },
    forceClose: () => { forceClose(); process.exit(1); },
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info(`[Shutdown] ${signal}; draining connections and jobs.`);
      void lifecycle.shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
    });
  }
}
