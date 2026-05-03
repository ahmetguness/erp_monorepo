/**
 * Trendyol Webhook Controller
 *
 * Endpoint: POST /api/public/trendyol/webhook/:integrationId
 * (Public — no JWT, but validated by secret header)
 *
 * Idempotency: each event is stored in marketplace_webhook_events.
 * Duplicate eventId → 200 OK (already processed).
 *
 * Supported event types:
 *   ORDER_STATUS_CHANGED — update order status in DB
 *   (others stored but not acted upon)
 */

import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { mapTrendyolOrderStatus } from '../services/trendyol.service';
import { MarketplaceOrderStatus } from '@prisma/client';

// Webhook secret is stored per-integration in apiSecret field
// Trendyol sends it as X-Webhook-Secret header (configurable in seller panel)
const WEBHOOK_SECRET_HEADER = 'x-webhook-secret';

export const TrendyolWebhookController = {

  async handle(c: Context): Promise<Response> {
    const integrationId = c.req.param('integrationId');

    // 1. Find integration
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id: integrationId, channel: 'TRENDYOL', isActive: true },
    });
    if (!integration) {
      return c.json({ error: 'Integration not found' }, 404);
    }

    // 2. Validate webhook secret (optional but recommended)
    const incomingSecret = c.req.header(WEBHOOK_SECRET_HEADER);
    if (integration.apiSecret && incomingSecret !== integration.apiSecret) {
      logger.warn(`[TrendyolWebhook] Invalid secret for integration ${integrationId}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // 3. Parse body
    let payload: Record<string, unknown>;
    try {
      payload = await c.req.json<Record<string, unknown>>();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    // 4. Extract event metadata
    // Trendyol webhook payload structure:
    // { eventType: string, eventId: string, supplierId: number, ... }
    const eventId = String(payload.eventId ?? payload.id ?? `${Date.now()}-${Math.random()}`);
    const eventType = String(payload.eventType ?? payload.type ?? 'UNKNOWN');

    // 5. Idempotency check
    const existing = await prisma.marketplaceWebhookEvent.findUnique({
      where: { integrationId_eventId: { integrationId, eventId } },
    });
    if (existing?.processedAt) {
      logger.info(`[TrendyolWebhook] Duplicate event ${eventId} — skipping`);
      return c.json({ ok: true, duplicate: true });
    }

    // 6. Store event (upsert for safety)
    const event = await prisma.marketplaceWebhookEvent.upsert({
      where: { integrationId_eventId: { integrationId, eventId } },
      create: {
        tenantId: integration.tenantId,
        integrationId,
        eventId,
        eventType,
        payload,
      },
      update: {},
    });

    // 7. Process event
    let errorMessage: string | null = null;
    try {
      await processWebhookEvent(integration.tenantId, integrationId, eventType, payload);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[TrendyolWebhook] Processing error for event ${eventId}: ${errorMessage}`);
    }

    // 8. Mark as processed
    await prisma.marketplaceWebhookEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        errorMessage,
      },
    });

    return c.json({ ok: true, eventId, eventType });
  },
};

// ─────────────────────────────────────────────
// Event processors
// ─────────────────────────────────────────────

async function processWebhookEvent(
  tenantId: string,
  integrationId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (eventType) {
    case 'ORDER_STATUS_CHANGED':
      await handleOrderStatusChanged(tenantId, integrationId, payload);
      break;

    default:
      // Store but don't act — future event types
      logger.info(`[TrendyolWebhook] Unhandled event type: ${eventType}`);
  }
}

async function handleOrderStatusChanged(
  tenantId: string,
  integrationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Trendyol sends: { shipmentPackageId, status, ... }
  const packageId = String(payload.shipmentPackageId ?? payload.packageId ?? '');
  const rawStatus = String(payload.status ?? payload.packageStatus ?? '');

  if (!packageId || !rawStatus) {
    throw new Error(`Missing packageId or status in payload: ${JSON.stringify(payload)}`);
  }

  const mappedStatus = mapTrendyolOrderStatus(rawStatus) as MarketplaceOrderStatus;

  const order = await prisma.marketplaceOrder.findFirst({
    where: { tenantId, integrationId, externalId: packageId },
  });

  if (!order) {
    logger.warn(`[TrendyolWebhook] Order ${packageId} not found in DB — may need sync`);
    return;
  }

  if (order.status !== mappedStatus) {
    await prisma.marketplaceOrder.update({
      where: { id: order.id },
      data: { status: mappedStatus, updatedAt: new Date() },
    });
    logger.info(`[TrendyolWebhook] Order ${packageId}: ${order.status} → ${mappedStatus}`);
  }
}
