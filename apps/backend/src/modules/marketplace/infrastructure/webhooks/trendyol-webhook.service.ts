import type { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import { ValidationError } from '../../../../errors/index.js';
import { enqueueDomainEvent } from '../../../../domain-events/outbox.js';
import { createEventContext } from '../../../../domain-events/events.js';
import { replayDomainEventOutbox } from '../../../../domain-events/delivery/replay.js';
import { PermanentDeliveryError } from '../../../../domain-events/delivery/retry-policy.js';
import { MarketplaceAutomationService } from '../../../../services/marketplace-automation.service.js';
import { buildEventId, extractOrderPackages, isJsonObject } from '../../domain/webhook-payload.js';
import { upsertMarketplaceOrder } from '../persistence/webhook-order.repository.js';

interface WebhookProcessingResult { eventId: string; packageId: string; duplicate: boolean; error: string | null; }

/** Receipt and dispatch intent are committed before acknowledging the provider. */
export async function queueTrendyolWebhookPayload(input: {
  tenantId: string; integrationId: string; payload: Prisma.JsonValue | Prisma.InputJsonValue; replayProcessed: boolean;
}): Promise<WebhookProcessingResult[]> {
  const payload = input.payload;
  if (!isJsonObject(payload)) throw new ValidationError('Webhook payload must be an object.');
  const packages = extractOrderPackages(payload);
  if (!packages.length) throw new ValidationError('No shipment package found in webhook payload.');
  if (Array.isArray(payload.content) && packages.length !== payload.content.length) {
    throw new ValidationError('Every shipment package in a webhook batch must be valid.');
  }
  const results: WebhookProcessingResult[] = [];
  for (const orderPackage of packages) {
    const eventId = buildEventId(orderPackage);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId + ':webhook:' + input.integrationId + ':' + eventId}, 0))`;
      const existing = await tx.marketplaceWebhookEvent.findUnique({ where: { integrationId_eventId: { integrationId: input.integrationId, eventId } } });
      if (existing) {
        await enqueueDomainEvent(tx, { name: 'marketplace.webhook.received', context: createEventContext({ tenantId: input.tenantId }), payload: { webhookEventId: existing.id } });
        return { record: existing, duplicate: true };
      }
      // Delivery selects this receipt by event ID; siblings from an HTTP batch are never processed by this receipt.
      const record = await tx.marketplaceWebhookEvent.create({
        data: {
          tenantId: input.tenantId, integrationId: input.integrationId,
          eventId, eventType: 'SHIPMENT_PACKAGE', payload
        }
      });
      await enqueueDomainEvent(tx, { name: 'marketplace.webhook.received', context: createEventContext({ tenantId: input.tenantId }), payload: { webhookEventId: record.id } });
      return { record, duplicate: false };
    });
    let requeued = false;
    if (input.replayProcessed) {
      const outbox = await prisma.domainEventOutbox.findUnique({
        where: {
          tenantId: input.tenantId, tenantId_idempotencyKey: {
            tenantId: input.tenantId, idempotencyKey: `domain:marketplace.webhook.received:${result.record.id}`,
          }
        }
      });
      if (outbox) requeued = outbox.status === 'PENDING' || (await replayDomainEventOutbox(input.tenantId, outbox.id, true))?.replayed === true;
    }
    results.push({ eventId, packageId: orderPackage.packageId, duplicate: input.replayProcessed ? !requeued : result.duplicate, error: null });
  }
  return results;
}

export async function deliverTrendyolWebhook(tenantId: string, webhookEventId: string): Promise<void> {
  const record = await prisma.marketplaceWebhookEvent.findFirstOrThrow({ where: { id: webhookEventId, tenantId } });
  if (record.processedAt && !record.errorMessage) return;
  const integration = await prisma.marketplaceIntegration.findFirst({ where: { id: record.integrationId, tenantId, isActive: true } });
  if (!integration) throw new PermanentDeliveryError('Webhook integration is inactive.');
  if (!isJsonObject(record.payload)) throw new PermanentDeliveryError('Invalid stored webhook payload.');
  const orderPackage = extractOrderPackages(record.payload).find((item) => buildEventId(item) === record.eventId);
  if (!orderPackage) throw new PermanentDeliveryError('Stored webhook package does not match its receipt.');
  try {
    const order = await upsertMarketplaceOrder(prisma, tenantId, record.integrationId, orderPackage);
    const result = await new MarketplaceAutomationService(prisma).processOrderAutomation(tenantId, order.id);
    if (result.errors.length) throw new Error(result.errors.join('; '));
    await prisma.marketplaceWebhookEvent.updateMany({ where: { id: record.id, tenantId }, data: { processedAt: new Date(), errorMessage: null } });
  } catch (error) {
    await prisma.marketplaceWebhookEvent.updateMany({ where: { id: record.id, tenantId }, data: { errorMessage: error instanceof Error ? error.message : 'Webhook processing failed.' } });
    throw error;
  }
}
