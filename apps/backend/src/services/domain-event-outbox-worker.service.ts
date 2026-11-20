import { processPendingTenantProvisioning } from '../modules/platform/infrastructure/index.js';
import type { DomainEvent } from '../domain-events/events.js';
import { deliverTrendyolWebhook } from '../modules/marketplace/infrastructure/index.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runWithTenantScope } from '../lib/tenant-isolation-context.js';
import { registerDomainEventListeners } from '../domain-events/listeners.js';
import { restoreStoredEvent } from '../domain-events/event-codec.js';
import { dispatchClaimedEvent } from '../domain-events/delivery/dispatch.js';
import { claimNextEvent, failEvent, recoverExpiredLeases, type OutboxLease } from '../domain-events/delivery/repository.js';
import { IncompatibleEventError, PermanentDeliveryError } from '../domain-events/delivery/retry-policy.js';
import { WorkerLoop } from '../modules/shared/index.js';
import { runWithObservabilityContext } from './observability.service.js';
import { deliverQueuedMail } from './mail-delivery/mail-delivery.service.js';
import { EDocumentAutomationService } from './edocument-automation.service.js';
import { ProviderHttpError } from '../infrastructure/providers/retry-policy.js';
import { reconcileProvisioningMailFailures } from './mail-delivery/provisioning-completion.js';
import { withSpan } from '../lib/telemetry/tracing.js';
import { observeTelemetry, countTelemetry } from '../lib/telemetry/metrics.js';

export interface DomainEventOutboxBatchResult {
  claimed: number; replayed: number; skipped: number; failed: number; requeuedStale: number;
}

async function deliverLease(lease: OutboxLease): Promise<boolean> {
  return runWithTenantScope(lease.tenantId, async () => {
    const record = await prisma.domainEventOutbox.findFirstOrThrow({ where: { id: lease.id, tenantId: lease.tenantId } });
    const started = performance.now();
    let succeeded = false;
    try {
      let event: DomainEvent;
      try { event = restoreStoredEvent(record); }
      catch (error) {
        if (error instanceof IncompatibleEventError) throw error;
        throw new PermanentDeliveryError(error instanceof Error ? error.message : 'Invalid event payload.');
      }
      const delivered = await withSpan('outbox.deliver', 5, { 'messaging.operation.name': 'process', 'messaging.message.type': event.name }, () => runWithObservabilityContext({ requestId: record.id, correlationId: event.context.correlationId ?? record.id }, async () => {
        if (event.name === 'marketplace.webhook.received') await deliverTrendyolWebhook(lease.tenantId, event.payload.webhookEventId);
        if (event.name === 'mail.delivery.requested') await deliverQueuedMail(lease, event.payload);
        if (event.name === 'edocument.delivery.requested') await new EDocumentAutomationService(prisma).deliverQueuedDocument(lease.tenantId, event.payload.edocumentId);
        const result = await dispatchClaimedEvent(event, lease);
        logger.info('Outbox delivery completed', { operation:'outbox.deliver', result:result?'success':'failure', requestId:record.id, correlationId:event.context.correlationId??record.id });
        return result;
      }), event.context.traceparent ?? null);
      succeeded = delivered;
      return delivered;
    } catch (error) {
      await failEvent(lease, [{ listener: 'delivery', message: error instanceof Error ? error.message : 'Event failed.' }],
        error instanceof PermanentDeliveryError || (error instanceof ProviderHttpError && !error.retryable),
        error instanceof ProviderHttpError ? error.retryAfterMs : 0);
      return false;
    } finally {
      observeTelemetry('axon_worker_delivery_duration_seconds', (performance.now() - started) / 1000, { result: succeeded ? 'success' : 'failure' });
      countTelemetry(succeeded ? 'axon_worker_deliveries_total' : 'axon_worker_delivery_failures_total');
    }
  });
}

export async function processDomainEventOutboxBatch(limit = 25, shouldStop: () => boolean = () => false): Promise<DomainEventOutboxBatchResult> {
  registerDomainEventListeners();
  await processPendingTenantProvisioning(shouldStop);
  const result: DomainEventOutboxBatchResult = { claimed: 0, replayed: 0, skipped: 0, failed: 0, requeuedStale: await recoverExpiredLeases() };
  if (result.requeuedStale) countTelemetry('axon_outbox_recovered_leases_total', result.requeuedStale);
  await reconcileProvisioningMailFailures();
  const batchSize = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 25;
  const deadline = Date.now() + 240_000;
  // Claim immediately before delivery so events never age behind earlier work in a batch.
  for (let index = 0; index < batchSize; index++) {
    if (shouldStop() || Date.now() >= deadline) break;
    const lease = await claimNextEvent();
    if (!lease) break;
    result.claimed++;
    if (await deliverLease(lease)) result.replayed++;
    else result.failed++;
  }
  return result;
}

class DomainEventOutboxWorkerService {
  private loop: WorkerLoop | null = null;
  start(intervalMs = Number(process.env.DOMAIN_EVENT_OUTBOX_WORKER_INTERVAL_MS ?? 10_000)): void {
    if (this.loop) return;
    const pollInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 10_000;
    this.loop = new WorkerLoop('DomainEventOutboxWorker', pollInterval, async () => { await this.tick(); });
    this.loop.start();
  }
  async stop(): Promise<void> {
    const loop = this.loop;
    await loop?.stop();
    if (this.loop === loop) this.loop = null;
  }
  async tick(): Promise<DomainEventOutboxBatchResult> {
    const result = await processDomainEventOutboxBatch(25, () => this.loop?.isStopping ?? false);
    if (result.claimed || result.requeuedStale) logger.info('[DomainEventOutboxWorker] Batch processed', { ...result });
    return result;
  }
}
export const DomainEventOutboxWorker = new DomainEventOutboxWorkerService();

export { replayDomainEventOutbox, type DomainEventReplayResult } from '../domain-events/delivery/replay.js';
