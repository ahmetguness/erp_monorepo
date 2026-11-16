/**
 * Trendyol Webhook Controller
 *
 * Trendyol sends shipment-package webhooks with the same response model as
 * getShipmentPackages: { content: [orderPackage, ...] }.
 */

import { createHmac } from 'crypto';
import { Context } from 'hono';
import { logger } from '../../../../lib/logger.js';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { decrypt } from '../../../../utils/encryption.js';
import { isJsonObject } from '../../domain/webhook-payload.js';
import { queueTrendyolWebhookPayload } from '../../infrastructure/webhooks/trendyol-webhook.service.js';

const WEBHOOK_API_KEY_HEADER = 'x-api-key';
const LEGACY_WEBHOOK_SECRET_HEADER = 'x-webhook-secret';
const WEBHOOK_SIGNATURE_HEADER = 'x-signature';
const WEBHOOK_TIMESTAMP_HEADER = 'x-timestamp';
const WEBHOOK_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const ALLOW_LEGACY_WEBHOOK_AUTH = process.env.ALLOW_LEGACY_WEBHOOK_AUTH === 'true';


type WebhookAuthorizationResult =
  | { ok: true; mode: 'hmac' | 'legacy' }
  | { ok: false; code: 'SIGNATURE_REQUIRED' | 'INVALID_TIMESTAMP' | 'TIMESTAMP_EXPIRED' | 'INVALID_SIGNATURE' };

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

    const rawBody = await c.req.raw.clone().text().catch(() => '');
    if (!rawBody.trim()) {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } }, 400);
    }

    const webhookSecret = decrypt(integration.apiSecret);
    const authorization = isAuthorizedWebhook(c, webhookSecret, rawBody);
    if (!authorization.ok) {
      logger.warn(`[TrendyolWebhook] Unauthorized request for integration ${integrationId}`, { reason: authorization.code });
      return c.json({ error: { code: authorization.code, message: 'Unauthorized' } }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON' } }, 400);
    }

    if (!isJsonObject(payload)) {
      return c.json({ error: { code: 'INVALID_PAYLOAD', message: 'Webhook payload must be an object.' } }, 400);
    }

    let results: Awaited<ReturnType<typeof queueTrendyolWebhookPayload>>;
    try {
      results = await queueTrendyolWebhookPayload({
        tenantId: integration.tenantId,
        integrationId,
        payload,
        replayProcessed: false,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json({ error: { code: 'INVALID_PAYLOAD', message: err.message } }, 400);
      }
      logger.error('[TrendyolWebhook] Failed to persist delivery intent.', { integrationId, errorType: err instanceof Error ? err.name : 'Unknown' });
      c.header('Retry-After', '5');
      return c.json({ error: { code: 'WEBHOOK_UNAVAILABLE', message: 'Webhook could not be stored. Please retry.' } }, 503);
    }

    return c.json({
      ok: true,
      processed: 0,
      queued: results.filter((r) => !r.duplicate).length,
      duplicate: results.filter((r) => r.duplicate).length,
      failed: results.filter((r) => r.error !== null).length,
      results,
    }, 202);
  },
};

function isAuthorizedWebhook(c: Context, expectedSecret: string | null, rawBody: string): WebhookAuthorizationResult {
  if (!expectedSecret) return { ok: false, code: 'INVALID_SIGNATURE' };

  const signedResult = verifySignedWebhook(c, expectedSecret, rawBody);
  if (signedResult.ok) return signedResult;

  if (ALLOW_LEGACY_WEBHOOK_AUTH && signedResult.code === 'SIGNATURE_REQUIRED' && isLegacyAuthorizedWebhook(c, expectedSecret)) {
    return { ok: true, mode: 'legacy' };
  }

  return signedResult;
}

function verifySignedWebhook(c: Context, expectedSecret: string, rawBody: string): WebhookAuthorizationResult {
  const timestamp = c.req.header(WEBHOOK_TIMESTAMP_HEADER)?.trim();
  const signature = normalizeSignature(c.req.header(WEBHOOK_SIGNATURE_HEADER));
  if (!timestamp || !signature) return { ok: false, code: 'SIGNATURE_REQUIRED' };

  const timestampMs = parseWebhookTimestampMs(timestamp);
  if (timestampMs === null) return { ok: false, code: 'INVALID_TIMESTAMP' };

  if (Math.abs(Date.now() - timestampMs) > WEBHOOK_SIGNATURE_TOLERANCE_MS) {
    return { ok: false, code: 'TIMESTAMP_EXPIRED' };
  }

  const expectedSignature = createHmac('sha256', expectedSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return safeEqualHex(signature, expectedSignature)
    ? { ok: true, mode: 'hmac' }
    : { ok: false, code: 'INVALID_SIGNATURE' };
}

function isLegacyAuthorizedWebhook(c: Context, expectedSecret: string): boolean {
  const incomingApiKey = c.req.header(WEBHOOK_API_KEY_HEADER);
  const legacySecret = c.req.header(LEGACY_WEBHOOK_SECRET_HEADER);
  const incomingBasic = readBasicPassword(c.req.header('authorization'));

  return [incomingApiKey, legacySecret, incomingBasic].some(
    (candidate) => typeof candidate === 'string' && safeEqual(candidate, expectedSecret),
  );
}

function normalizeSignature(header: string | undefined): string | null {
  if (!header) return null;
  const value = header.trim().toLowerCase();
  const normalized = value.startsWith('sha256=') ? value.slice('sha256='.length) : value;
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function parseWebhookTimestampMs(value: string): number | null {
  if (!/^\d{10,13}$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;

  return value.length === 10 ? parsed * 1000 : parsed;
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

function safeEqualHex(leftHex: string, rightHex: string): boolean {
  const leftBytes = Buffer.from(leftHex, 'hex');
  const rightBytes = Buffer.from(rightHex, 'hex');
  if (leftBytes.length !== rightBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < leftBytes.length; i++) {
    diff |= leftBytes[i] ^ rightBytes[i];
  }
  return diff === 0;
}
