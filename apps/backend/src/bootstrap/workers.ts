import { startMarketplaceMocks, stopAllMocks } from '../mocks/index.js';
import { logger } from '../lib/logger.js';
import { DomainEventOutboxWorker } from '../services/domain-event-outbox-worker.service.js';
import { TrendyolWorker } from '../services/trendyol-worker.service.js';
import type { AppRole } from './runtime-config.js';
import { prisma } from '../lib/prisma.js';

let shutdownRegistered = false;
let shuttingDown = false;

function isEnabled(explicitValue: string | undefined, role: AppRole): boolean {
  if (explicitValue === 'true') return true;
  if (explicitValue === 'false') return false;
  return role === 'worker' || role === 'all';
}

export function startWorkers(role: AppRole, env: NodeJS.ProcessEnv = process.env): void {
  if (isEnabled(env.DOMAIN_EVENT_OUTBOX_WORKER_ENABLED, role)) DomainEventOutboxWorker.start();
  else logger.info('[DomainEventOutboxWorker] Disabled. Set DOMAIN_EVENT_OUTBOX_WORKER_ENABLED=true or APP_ROLE=worker/all to enable.');

  if (isEnabled(env.MARKETPLACE_WORKER_ENABLED, role)) TrendyolWorker.start();
  else logger.info('[TrendyolWorker] Disabled. Set MARKETPLACE_WORKER_ENABLED=true or APP_ROLE=worker/all to enable.');

  startMarketplaceMocks();
  registerWorkerShutdown();
}

export async function stopWorkers(): Promise<void> {
  await Promise.all([DomainEventOutboxWorker.stop(), TrendyolWorker.stop()]);
  stopAllMocks();
}

function registerWorkerShutdown(): void {
  if (shutdownRegistered || process.env.NODE_ENV === 'test') return;
  shutdownRegistered = true;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[Workers] ${signal} received; waiting for active jobs to finish.`);
    await stopWorkers();
    await prisma.$disconnect();
  };
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}
