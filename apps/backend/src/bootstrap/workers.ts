import { startMarketplaceMocks, stopAllMocks } from "../mocks/index.js";
import { logger } from "../lib/logger.js";
import { DomainEventOutboxWorker } from "../services/domain-event-outbox-worker.service.js";
import { TrendyolWorker } from "../services/trendyol-worker.service.js";
import type { AppRole } from "./runtime-config.js";
import { PersistentObservabilityWorker } from "../modules/platform/index.js";
import { ChatAttachmentWorker, ChatRetentionWorker } from "../modules/storage-accounting/index.js";

function isEnabled(explicitValue: string | undefined, role: AppRole): boolean {
  if (explicitValue === "true") return true;
  if (explicitValue === "false") return false;
  return role === "worker" || role === "all";
}

export function startWorkers(
  role: AppRole,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isEnabled(env.PERSISTENT_OBSERVABILITY_ENABLED, role))
    PersistentObservabilityWorker.start();
  if (isEnabled(env.DOMAIN_EVENT_OUTBOX_WORKER_ENABLED, role))
    DomainEventOutboxWorker.start();
  else
    logger.info(
      "[DomainEventOutboxWorker] Disabled. Set DOMAIN_EVENT_OUTBOX_WORKER_ENABLED=true or APP_ROLE=worker/all to enable.",
    );

  if (isEnabled(env.MARKETPLACE_WORKER_ENABLED, role)) TrendyolWorker.start();
  else
    logger.info(
      "[TrendyolWorker] Disabled. Set MARKETPLACE_WORKER_ENABLED=true or APP_ROLE=worker/all to enable.",
    );

  const chatAttachmentWorkerEnabled = env.CHAT_ATTACHMENT_WORKER_ENABLED === 'true'
    || (env.CHAT_ATTACHMENT_WORKER_ENABLED !== 'false' && (role === 'worker' || role === 'all' || env.NODE_ENV !== 'production'));
  if (chatAttachmentWorkerEnabled) ChatAttachmentWorker.start();
  else logger.info('[ChatAttachmentWorker] Disabled. Set CHAT_ATTACHMENT_WORKER_ENABLED=true or APP_ROLE=worker/all to enable.');
  if (chatAttachmentWorkerEnabled) ChatRetentionWorker.start();

  startMarketplaceMocks();
}

export async function stopWorkers(): Promise<void> {
  await Promise.all([
    DomainEventOutboxWorker.stop(),
    TrendyolWorker.stop(),
    PersistentObservabilityWorker.stop(),
    ChatAttachmentWorker.stop(),
    ChatRetentionWorker.stop(),
  ]);
  stopAllMocks();
}
