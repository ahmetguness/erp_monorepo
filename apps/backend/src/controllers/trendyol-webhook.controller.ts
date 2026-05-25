/**
 * Trendyol Webhook Controller
 *
 * Trendyol sends shipment-package webhooks with the same response model as
 * getShipmentPackages: { content: [orderPackage, ...] }.
 */

import { Context } from 'hono';
import { MarketplaceOrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { mapTrendyolOrderStatus } from '../services/trendyol.service';
import { decrypt } from '../utils/encryption.js';

const WEBHOOK_API_KEY_HEADER = 'x-api-key';
const LEGACY_WEBHOOK_SECRET_HEADER = 'x-webhook-secret';

type JsonObject = Prisma.InputJsonObject;

interface WebhookOrderLine {
  contentId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface WebhookOrderPackage {
  packageId: string;
  status: MarketplaceOrderStatus;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  totalAmount: number;
  orderDate: Date;
  lastModifiedDate: string;
  lines: WebhookOrderLine[];
}

interface WebhookProcessingResult {
  eventId: string;
  packageId: string;
  duplicate: boolean;
  error: string | null;
}

export const TrendyolWebhookController = {
  async handle(c: Context): Promise<Response> {
    const integrationId = c.req.param('integrationId');
    if (!integrationId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'integrationId is required.' } }, 400);
    }

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id: integrationId, channel: 'TRENDYOL', isActive: true },
    });
    if (!integration) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Integration not found' } }, 404);
    }

    if (!integration.apiSecret) {
      logger.warn(`[TrendyolWebhook] Integration ${integrationId} has no webhook secret configured. Rejecting request.`);
      return c.json({ error: { code: 'WEBHOOK_SECRET_MISSING', message: 'Bu entegrasyona webhook secret tanımlanmamış. Yönetici ile iletişime geçin.' } }, 403);
    }

    const webhookSecret = decrypt(integration.apiSecret);
    if (!isAuthorizedWebhook(c, webhookSecret)) {
      logger.warn(`[TrendyolWebhook] Unauthorized request for integration ${integrationId}`);
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401);
    }

    let payload: Prisma.InputJsonValue;
    try {
      payload = await c.req.json<Prisma.InputJsonValue>();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } }, 400);
    }

    if (!isJsonObject(payload)) {
      return c.json({ error: { code: 'INVALID_PAYLOAD', message: 'Webhook payload must be an object.' } }, 400);
    }

    let results: WebhookProcessingResult[];
    try {
      results = await processTrendyolWebhookPayload({
        tenantId: integration.tenantId,
        integrationId,
        payload,
        replayProcessed: false,
      });
    } catch (err) {
      return c.json({ error: { code: 'INVALID_PAYLOAD', message: err instanceof Error ? err.message : 'Invalid webhook payload.' } }, 400);
    }

    return c.json({
      ok: true,
      processed: results.filter((r) => !r.duplicate && r.error === null).length,
      duplicate: results.filter((r) => r.duplicate).length,
      failed: results.filter((r) => r.error !== null).length,
      results,
    });
  },
};

export async function processTrendyolWebhookPayload({
  tenantId,
  integrationId,
  payload,
  replayProcessed,
}: {
  tenantId: string;
  integrationId: string;
  payload: Prisma.InputJsonValue | Prisma.JsonValue;
  replayProcessed: boolean;
}): Promise<WebhookProcessingResult[]> {
  if (!isJsonObject(payload)) {
    throw new Error('Webhook payload must be an object.');
  }

  const packages = extractOrderPackages(payload);
  if (packages.length === 0) {
    throw new Error('No shipment package found in webhook payload.');
  }

  const results: WebhookProcessingResult[] = [];

  for (const orderPackage of packages) {
    const eventId = buildEventId(orderPackage);
    const existing = await prisma.marketplaceWebhookEvent.findUnique({
      where: { integrationId_eventId: { integrationId, eventId } },
    });

    if (existing?.processedAt && !replayProcessed) {
      results.push({ eventId, packageId: orderPackage.packageId, duplicate: true, error: existing.errorMessage });
      continue;
    }

    const event = await prisma.marketplaceWebhookEvent.upsert({
      where: { integrationId_eventId: { integrationId, eventId } },
      create: {
        tenantId,
        integrationId,
        eventId,
        eventType: 'SHIPMENT_PACKAGE',
        payload,
      },
      update: { payload },
    });

    let errorMessage: string | null = null;
    try {
      await upsertMarketplaceOrder(tenantId, integrationId, orderPackage);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[TrendyolWebhook] Processing error for event ${eventId}: ${errorMessage}`);
    }

    await prisma.marketplaceWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), errorMessage },
    });

    results.push({ eventId, packageId: orderPackage.packageId, duplicate: false, error: errorMessage });
  }

  return results;
}

function isAuthorizedWebhook(c: Context, expectedSecret: string | null): boolean {
  if (!expectedSecret) return false;

  const incomingApiKey = c.req.header(WEBHOOK_API_KEY_HEADER);
  const legacySecret = c.req.header(LEGACY_WEBHOOK_SECRET_HEADER);
  const incomingBasic = readBasicPassword(c.req.header('authorization'));

  return [incomingApiKey, legacySecret, incomingBasic].some(
    (candidate) => typeof candidate === 'string' && safeEqual(candidate, expectedSecret),
  );
}

function readBasicPassword(header: string | undefined): string | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < leftBytes.length; i++) {
    diff |= leftBytes[i] ^ rightBytes[i];
  }
  return diff === 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractOrderPackages(payload: JsonObject): WebhookOrderPackage[] {
  const content = payload.content;

  if (Array.isArray(content)) {
    return content.filter(isJsonObject).map(parseOrderPackage).filter((item): item is WebhookOrderPackage => item !== null);
  }

  const singlePackage = parseOrderPackage(payload);
  return singlePackage ? [singlePackage] : [];
}

function parseOrderPackage(input: JsonObject): WebhookOrderPackage | null {
  const packageId = readString(input, 'shipmentPackageId') ?? readString(input, 'packageId');
  const rawStatus = readString(input, 'status') ?? readString(input, 'shipmentPackageStatus');
  const orderDate = readNumber(input, 'orderDate');

  if (!packageId || !rawStatus || orderDate === null) return null;

  const shipmentAddress = readObject(input, 'shipmentAddress');
  const firstName = readString(input, 'customerFirstName');
  const lastName = readString(input, 'customerLastName');
  const customerName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const totalAmount = readNumber(input, 'packageTotalPrice') ?? readNumber(input, 'packageGrossAmount') ?? 0;

  return {
    packageId,
    status: mapTrendyolOrderStatus(rawStatus) as MarketplaceOrderStatus,
    customerName,
    customerEmail: readString(input, 'customerEmail'),
    customerPhone: shipmentAddress ? readString(shipmentAddress, 'phone') : null,
    shippingAddress: shipmentAddress ? readString(shipmentAddress, 'fullAddress') : null,
    totalAmount,
    orderDate: new Date(orderDate),
    lastModifiedDate: String(readNumber(input, 'lastModifiedDate') ?? orderDate),
    lines: readLines(input),
  };
}

function readLines(input: JsonObject): WebhookOrderLine[] {
  const lines = input.lines;
  if (!Array.isArray(lines)) return [];

  return lines.filter(isJsonObject).map((line) => {
    const unitPrice = readNumber(line, 'lineUnitPrice') ?? 0;
    const quantity = readNumber(line, 'quantity') ?? 0;
    return {
      contentId: readString(line, 'contentId') ?? readString(line, 'barcode') ?? '',
      productName: readString(line, 'productName') ?? 'Trendyol ürünü',
      quantity,
      unitPrice,
      lineTotal: readNumber(line, 'lineGrossAmount') ?? unitPrice * quantity,
    };
  });
}

function readObject(input: JsonObject, key: string): JsonObject | null {
  const value = input[key];
  return isJsonObject(value) ? value : null;
}

function readString(input: JsonObject, key: string): string | null {
  const value = input[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(input: JsonObject, key: string): number | null {
  const value = input[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildEventId(orderPackage: WebhookOrderPackage): string {
  return `${orderPackage.packageId}:${orderPackage.status}:${orderPackage.lastModifiedDate}`;
}

async function upsertMarketplaceOrder(
  tenantId: string,
  integrationId: string,
  orderPackage: WebhookOrderPackage,
): Promise<void> {
  const existing = await prisma.marketplaceOrder.findFirst({
    where: { tenantId, integrationId, externalId: orderPackage.packageId },
    select: { id: true, status: true },
  });

  if (existing) {
    await prisma.marketplaceOrder.update({
      where: { id: existing.id },
      data: {
        status: orderPackage.status,
        customerName: orderPackage.customerName,
        customerEmail: orderPackage.customerEmail,
        customerPhone: orderPackage.customerPhone,
        shippingAddress: orderPackage.shippingAddress,
        totalAmount: orderPackage.totalAmount,
        orderDate: orderPackage.orderDate,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return;
  }

  await prisma.marketplaceOrder.create({
    data: {
      tenantId,
      integrationId,
      externalId: orderPackage.packageId,
      channel: 'TRENDYOL',
      status: orderPackage.status,
      customerName: orderPackage.customerName,
      customerEmail: orderPackage.customerEmail,
      customerPhone: orderPackage.customerPhone,
      shippingAddress: orderPackage.shippingAddress,
      totalAmount: orderPackage.totalAmount,
      orderDate: orderPackage.orderDate,
      syncedAt: new Date(),
      items: {
        create: orderPackage.lines.map((line) => ({
          tenantId,
          externalProductId: line.contentId,
          name: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
      },
    },
  });
}
