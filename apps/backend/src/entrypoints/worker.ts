import { logger } from '../lib/logger.js';
import { startWorkers } from '../bootstrap/workers.js';

export function startWorkerProcess(): void {
  logger.info('[Startup] APP_ROLE=worker; HTTP API server disabled.');
  startWorkers('worker');
}
