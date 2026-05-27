process.env.APP_ROLE = process.env.APP_ROLE ?? 'worker';

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { registerDomainEventListeners } from '../domain-events';
import { DomainEventOutboxWorker } from '../services/domain-event-outbox-worker.service.js';

registerDomainEventListeners();
DomainEventOutboxWorker.start();

async function shutdown(signal: string): Promise<void> {
  logger.info(`[DomainEventOutboxWorker] ${signal} received, shutting down.`);
  DomainEventOutboxWorker.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
