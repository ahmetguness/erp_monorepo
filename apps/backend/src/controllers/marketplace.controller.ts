import { Context } from 'hono';
import { AuditAction, EntityType, MarketplaceChannel, MarketplaceOrderStatus, Prisma, SyncJobType, SyncJobStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import {
  TrendyolService,
  buildTrendyolCredentials,
} from '../services/trendyol.service';
import type { TrendyolProductItemInput } from '../services/trendyol.service';
import { TrendyolWorker } from '../services/trendyol-worker.service';
import type { JobParams } from '../services/trendyol-worker.service';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { getPaginationParams } from '../utils/pagination.js';
import { encrypt } from '../utils/encryption.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { processTrendyolWebhookPayload } from './trendyol-webhook.controller.js';

type IntegrationWithSecrets = {
  apiKey: string | null;
  apiSecret: string | null;
};

interface TrendyolListingProductDTO {
  barcode?: string;
  title?: string;
  productMainId?: string;
  brandId: number;
  categoryId: number;
  quantity?: number;
  stockCode?: string;
  dimensionalWeight?: number;
  description?: string;
  listPrice?: number;
  salePrice?: number;
  vatRate?: number;
  cargoCompanyId: number;
  shipmentAddressId?: number;
  returningAddressId?: number;
  images?: string[];
  attributes?: Array<{
    attributeId: number;
    attributeValueId?: number;
    customAttributeValue?: string;
  }>;
}

type MarketplaceListingActionListing = Prisma.MarketplaceListingGetPayload<{
  include: {
    product: { select: { id: true; code: true; name: true; salesPrice: true } };
    integration: { select: { id: true; channel: true; name: true } };
  };
}>;

interface MarketplaceListingActionResult {
  batchRequestId: string;
  listing: MarketplaceListingActionListing;
}

interface MarketplaceIntegrationHealthSummary {
  integration: Omit<Prisma.MarketplaceIntegrationGetPayload<{
    include: { _count: { select: { listings: true; orders: true } } };
  }>, 'apiKey' | 'apiSecret'> & {
    apiKey: null;
    apiSecret: null;
    hasApiKey: boolean;
    hasApiSecret: boolean;
  };
  lastSuccessfulSyncAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  errorRate: number;
  pendingJobCount: number;
  runningJobCount: number;
  failedJobCount: number;
  retryAvailableCount: number;
  webhookReplayCount: number;
  webhookFailureCount: number;
  apiLimit: {
    status: 'UNKNOWN' | 'OK' | 'WARNING' | 'LIMITED';
    remaining: number | null;
    resetAt: string | null;
  };
}

function hideIntegrationSecrets<T extends IntegrationWithSecrets>(
  integration: T,
): Omit<T, 'apiKey' | 'apiSecret'> & {
  apiKey: null;
  apiSecret: null;
  hasApiKey: boolean;
  hasApiSecret: boolean;
} {
  const { apiKey, apiSecret, ...rest } = integration;
  return {
    ...rest,
    apiKey: null,
    apiSecret: null,
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMarketplaceChannel(value: unknown): value is MarketplaceChannel {
  return typeof value === 'string' && Object.values(MarketplaceChannel).includes(value as MarketplaceChannel);
}

interface CreateIntegrationBody {
  channel: MarketplaceChannel;
  name: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string;
}

interface UpdateIntegrationBody {
  name?: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string | null;
  isActive?: boolean;
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : undefined;
}

function parseCreateIntegrationBody(value: unknown): CreateIntegrationBody | ValidationError {
  if (!isJsonObject(value)) return new ValidationError('Geçersiz istek gövdesi.');
  const channel = value.channel;
  const name = readOptionalString(value, 'name') ?? '';
  if (!isMarketplaceChannel(channel) || !name) return new ValidationError('channel ve name zorunludur.');
  return {
    channel,
    name,
    apiKey: readOptionalString(value, 'apiKey'),
    apiSecret: readOptionalString(value, 'apiSecret'),
    storeId: readOptionalString(value, 'storeId'),
  };
}

function parseUpdateIntegrationBody(value: unknown): UpdateIntegrationBody | ValidationError {
  if (!isJsonObject(value)) return new ValidationError('Geçersiz istek gövdesi.');
  const body: UpdateIntegrationBody = {};
  if ('name' in value) body.name = readOptionalString(value, 'name') ?? '';
  if ('apiKey' in value) body.apiKey = readOptionalString(value, 'apiKey') ?? '';
  if ('apiSecret' in value) body.apiSecret = readOptionalString(value, 'apiSecret') ?? '';
  if ('storeId' in value) body.storeId = readOptionalString(value, 'storeId') ?? null;
  if ('isActive' in value && typeof value.isActive === 'boolean') body.isActive = value.isActive;
  if (body.name !== undefined && body.name.length === 0) return new ValidationError('name boş olamaz.');
  return body;
}

function toJobParams(value: Prisma.JsonValue): JobParams {
  return isJsonObject(value) ? value : {};
}

function readJsonNumber(value: Prisma.JsonValue | null, keys: string[]): number | null {
  if (!isJsonObject(value)) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readJsonString(value: Prisma.JsonValue | null, keys: string[]): string | null {
  if (!isJsonObject(value)) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return null;
}

function getApiLimitStatus(remaining: number | null): 'UNKNOWN' | 'OK' | 'WARNING' | 'LIMITED' {
  if (remaining === null) return 'UNKNOWN';
  if (remaining <= 0) return 'LIMITED';
  if (remaining <= 20) return 'WARNING';
  return 'OK';
}

function calculateErrorRate(total: number, failed: number): number {
  if (total <= 0) return 0;
  return Math.round((failed / total) * 1000) / 10;
}

function parsePositiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function toTrendyolProductItem(
  listing: {
    externalId: string;
    externalSku: string | null;
    price: Prisma.Decimal;
    stock: Prisma.Decimal;
    product: {
      code: string;
      name: string;
      barcode: string | null;
      description: string | null;
      imageUrl: string | null;
    };
  },
  body: TrendyolListingProductDTO,
): TrendyolProductItemInput {
  const barcode = (body.barcode ?? listing.externalId ?? listing.product.barcode ?? '').trim();
  const title = (body.title ?? listing.product.name).trim();
  const productMainId = (body.productMainId ?? listing.product.code).trim();
  const stockCode = (body.stockCode ?? listing.externalSku ?? listing.product.code).trim();
  const description = (body.description ?? listing.product.description ?? title).trim();
  const salePrice = parsePositiveNumber(body.salePrice, Number(listing.price));
  const listPrice = parsePositiveNumber(body.listPrice, salePrice);
  const quantity = parsePositiveNumber(body.quantity, Number(listing.stock));
  const dimensionalWeight = parsePositiveNumber(body.dimensionalWeight, 1);
  const vatRate = parsePositiveNumber(body.vatRate, 20);
  const imageUrls = body.images?.filter((url) => url.trim().length > 0)
    ?? (listing.product.imageUrl ? [listing.product.imageUrl] : []);

  return {
    barcode,
    title,
    productMainId,
    brandId: body.brandId,
    categoryId: body.categoryId,
    quantity,
    stockCode,
    dimensionalWeight,
    description,
    currencyType: 'TRY',
    listPrice,
    salePrice,
    vatRate,
    cargoCompanyId: body.cargoCompanyId,
    ...(body.shipmentAddressId !== undefined && { shipmentAddressId: body.shipmentAddressId }),
    ...(body.returningAddressId !== undefined && { returningAddressId: body.returningAddressId }),
    images: imageUrls.map((url) => ({ url })),
    attributes: body.attributes ?? [],
  };
}

// ─────────────────────────────────────────────
// Marketplace Controller — Entegrasyon, Listeleme, Sipariş
// ─────────────────────────────────────────────

export const MarketplaceIntegrationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const data = await prisma.marketplaceIntegration.findMany({
      where: { tenantId },
      include: { _count: { select: { listings: true, orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({ data: data.map(hideIntegrationSecrets) });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { listings: true, orders: true } },
        listings: { take: 5, orderBy: { lastSyncAt: 'desc' }, include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!integration) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);
    return c.json({ data: hideIntegrationSecrets(integration) });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const parsed = parseCreateIntegrationBody(await c.req.json<unknown>().catch(() => null));
    if (parsed instanceof ValidationError) return c.json(parsed.toJSON(), 400);
    const body = parsed;

    const exists = await prisma.marketplaceIntegration.findUnique({
      where: { tenantId_channel: { tenantId, channel: body.channel } },
    });
    if (exists) return c.json(new ValidationError(`${body.channel} kanalı zaten bağlı.`).toJSON(), 400);

    const integration = await prisma.marketplaceIntegration.create({
      data: {
        tenantId, channel: body.channel, name: body.name,
        apiKey: body.apiKey ? encrypt(body.apiKey) : null, apiSecret: body.apiSecret ? encrypt(body.apiSecret) : null, storeId: body.storeId ?? null,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.OTHER,
      entityId: integration.id,
      action: AuditAction.CREATE,
      newValues: {
        id: integration.id,
        channel: integration.channel,
        name: integration.name,
        storeId: integration.storeId,
        hasApiKey: Boolean(integration.apiKey),
        hasApiSecret: Boolean(integration.apiSecret),
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: hideIntegrationSecrets(integration) }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);

    const parsed = parseUpdateIntegrationBody(await c.req.json<unknown>().catch(() => null));
    if (parsed instanceof ValidationError) return c.json(parsed.toJSON(), 400);
    const body = parsed;
    const updated = await prisma.marketplaceIntegration.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.apiKey !== undefined && { apiKey: body.apiKey ? encrypt(body.apiKey) : null }),
        ...(body.apiSecret !== undefined && { apiSecret: body.apiSecret ? encrypt(body.apiSecret) : null }),
        ...(body.storeId !== undefined && { storeId: body.storeId }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: {
        id,
        channel: existing.channel,
        name: existing.name,
        storeId: existing.storeId,
        isActive: existing.isActive,
        hasApiKey: Boolean(existing.apiKey),
        hasApiSecret: Boolean(existing.apiSecret),
      },
      newValues: {
        id: updated.id,
        channel: updated.channel,
        name: updated.name,
        storeId: updated.storeId,
        isActive: updated.isActive,
        hasApiKey: Boolean(updated.apiKey),
        hasApiSecret: Boolean(updated.apiSecret),
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: hideIntegrationSecrets(updated) });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);

    await prisma.marketplaceIntegration.delete({ where: { id } });
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.DELETE,
      oldValues: {
        id,
        channel: existing.channel,
        name: existing.name,
        storeId: existing.storeId,
        isActive: existing.isActive,
        hasApiKey: Boolean(existing.apiKey),
        hasApiSecret: Boolean(existing.apiSecret),
      },
      ...getRequestMeta(c),
    });
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Marketplace Listing Controller
// ─────────────────────────────────────────────

export const MarketplaceListingController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const integrationId = c.req.query('integrationId');

    const where = { tenantId, ...(integrationId && { integrationId }) };

    const [total, data] = await prisma.$transaction([
      prisma.marketplaceListing.count({ where }),
      prisma.marketplaceListing.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
        orderBy: { lastSyncAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      integrationId: string; productId: string; externalId: string;
      externalSku?: string; price: number; stock?: number;
    }>();
    if (!body.integrationId || !body.productId || !body.externalId || body.price == null) {
      return c.json(new ValidationError('integrationId, productId, externalId ve price zorunludur.').toJSON(), 400);
    }

    const [integration, product] = await prisma.$transaction([
      prisma.marketplaceIntegration.findFirst({ where: { id: body.integrationId, tenantId } }),
      prisma.product.findFirst({ where: { id: body.productId, tenantId } }),
    ]);
    if (!integration) return c.json(new NotFoundError('Entegrasyon', body.integrationId).toJSON(), 404);
    if (!product) return c.json(new NotFoundError('Ürün', body.productId).toJSON(), 404);

    const listing = await prisma.marketplaceListing.create({
      data: {
        tenantId, integrationId: body.integrationId, productId: body.productId,
        externalId: body.externalId, externalSku: body.externalSku ?? null,
        price: body.price, stock: body.stock ?? 0,
      },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    return c.json({ data: listing }, 201);
  },

  async publishToMarketplace(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const listing = await prisma.marketplaceListing.findFirst({
      where: { id, tenantId },
      include: {
        integration: true,
        product: {
          select: { code: true, name: true, barcode: true, description: true, imageUrl: true },
        },
      },
    });
    if (!listing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);
    if (listing.integration.channel !== MarketplaceChannel.TRENDYOL) {
      return c.json(new ValidationError('Bu aksiyon şu anda sadece Trendyol entegrasyonu için desteklenir.').toJSON(), 400);
    }
    if (!listing.integration.isActive) return c.json(new ValidationError('Entegrasyon pasif.').toJSON(), 400);

    const body = await c.req.json<TrendyolListingProductDTO>();
    const item = toTrendyolProductItem(listing, body);

    try {
      const creds = buildTrendyolCredentials(listing.integration);
      const batch = await TrendyolService.createProducts(creds, [item]);
      const updated = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          externalId: item.barcode,
          externalSku: item.stockCode,
          price: item.salePrice,
          stock: item.quantity,
          isActive: true,
          lastSyncAt: new Date(),
          syncError: null,
        },
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
      });
      const result: MarketplaceListingActionResult = { batchRequestId: batch.batchRequestId, listing: updated };
      return c.json({ data: result }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.marketplaceListing.update({ where: { id }, data: { syncError: message } });
      return c.json(new ValidationError(message).toJSON(), 502);
    }
  },

  async updateMarketplaceProduct(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const listing = await prisma.marketplaceListing.findFirst({
      where: { id, tenantId },
      include: {
        integration: true,
        product: {
          select: { code: true, name: true, barcode: true, description: true, imageUrl: true },
        },
      },
    });
    if (!listing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);
    if (listing.integration.channel !== MarketplaceChannel.TRENDYOL) {
      return c.json(new ValidationError('Bu aksiyon şu anda sadece Trendyol entegrasyonu için desteklenir.').toJSON(), 400);
    }

    const body = await c.req.json<TrendyolListingProductDTO>();
    const item = toTrendyolProductItem(listing, body);

    try {
      const creds = buildTrendyolCredentials(listing.integration);
      const batch = await TrendyolService.updateProducts(creds, [item]);
      const updated = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          externalId: item.barcode,
          externalSku: item.stockCode,
          price: item.salePrice,
          stock: item.quantity,
          lastSyncAt: new Date(),
          syncError: null,
        },
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
      });
      const result: MarketplaceListingActionResult = { batchRequestId: batch.batchRequestId, listing: updated };
      return c.json({ data: result }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.marketplaceListing.update({ where: { id }, data: { syncError: message } });
      return c.json(new ValidationError(message).toJSON(), 502);
    }
  },

  async deleteMarketplaceProduct(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const listing = await prisma.marketplaceListing.findFirst({
      where: { id, tenantId },
      include: { integration: true, product: { select: { barcode: true } } },
    });
    if (!listing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);
    if (listing.integration.channel !== MarketplaceChannel.TRENDYOL) {
      return c.json(new ValidationError('Bu aksiyon şu anda sadece Trendyol entegrasyonu için desteklenir.').toJSON(), 400);
    }

    const body = await c.req.json<{ barcode?: string }>().catch((): { barcode?: string } => ({}));
    const barcode = (body.barcode ?? listing.externalId ?? listing.product.barcode ?? '').trim();

    try {
      const creds = buildTrendyolCredentials(listing.integration);
      const batch = await TrendyolService.deleteProducts(creds, [{ barcode }]);
      const updated = await prisma.marketplaceListing.update({
        where: { id },
        data: { isActive: false, lastSyncAt: new Date(), syncError: null },
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
      });
      const result: MarketplaceListingActionResult = { batchRequestId: batch.batchRequestId, listing: updated };
      return c.json({ data: result }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.marketplaceListing.update({ where: { id }, data: { syncError: message } });
      return c.json(new ValidationError(message).toJSON(), 502);
    }
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.marketplaceListing.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);

    const body = await c.req.json<{ price?: number; stock?: number; isActive?: boolean; externalSku?: string }>();
    const updated = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        ...(body.price !== undefined && { price: body.price }),
        ...(body.stock !== undefined && { stock: body.stock }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.externalSku !== undefined && { externalSku: body.externalSku }),
        lastSyncAt: new Date(),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.marketplaceListing.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);

    await prisma.marketplaceListing.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Marketplace Order Controller
// ─────────────────────────────────────────────

export const MarketplaceOrderController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query('status') as MarketplaceOrderStatus | undefined;
    const channel = c.req.query('channel') as MarketplaceChannel | undefined;

    const where = { tenantId, ...(status && { status }), ...(channel && { channel }) };

    const [total, data] = await prisma.$transaction([
      prisma.marketplaceOrder.count({ where }),
      prisma.marketplaceOrder.findMany({
        where,
        include: {
          integration: { select: { id: true, channel: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { orderDate: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const order = await prisma.marketplaceOrder.findFirst({
      where: { id, tenantId },
      include: {
        integration: { select: { id: true, channel: true, name: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!order) return c.json(new NotFoundError('Pazaryeri Siparişi', id).toJSON(), 404);
    return c.json({ data: order });
  },

  async changeStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const order = await prisma.marketplaceOrder.findFirst({ where: { id, tenantId } });
    if (!order) return c.json(new NotFoundError('Pazaryeri Siparişi', id).toJSON(), 404);

    const body = await c.req.json<{ status: MarketplaceOrderStatus }>();
    if (!body.status) return c.json(new ValidationError('status zorunludur.').toJSON(), 400);

    const updated = await prisma.marketplaceOrder.update({
      where: { id },
      data: { status: body.status },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const order = await prisma.marketplaceOrder.findFirst({ where: { id, tenantId } });
    if (!order) return c.json(new NotFoundError('Pazaryeri Siparişi', id).toJSON(), 404);

    const terminalStatuses: MarketplaceOrderStatus[] = ['DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'];
    if (!terminalStatuses.includes(order.status)) {
      return c.json(new ValidationError('Sadece tamamlanmış, iptal edilmiş veya iade edilmiş siparişler silinebilir.').toJSON(), 400);
    }

    await prisma.marketplaceOrder.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Trendyol Sync Controller — queue-based
// ─────────────────────────────────────────────



export const TrendyolSyncController = {

  /** POST /marketplace/integrations/:id/trendyol/test */
  async testConnection(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId, channel: 'TRENDYOL' },
    });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    try {
      const creds = buildTrendyolCredentials(integration);
      const result = await TrendyolService.testConnection(creds);
      return c.json({ data: result });
    } catch (err) {
      return c.json({ data: { success: false, message: err instanceof Error ? err.message : String(err) } });
    }
  },

  /**
   * POST /marketplace/integrations/:id/trendyol/sync-orders
   * Enqueues a SYNC_ORDERS job and returns the job ID immediately.
   */
  async syncOrders(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId, channel: 'TRENDYOL' },
    });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const body = await c.req.json<{ hoursBack?: number; status?: string }>().catch((): { hoursBack?: number; status?: string } => ({}));
    const jobId = await TrendyolWorker.enqueue(tenantId, id, SyncJobType.SYNC_ORDERS, {
      hoursBack: body.hoursBack ?? 24,
      status: body.status,
    });

    return c.json({ data: { jobId, message: 'Sipariş senkronizasyonu kuyruğa alındı.' } }, 202);
  },

  /**
   * POST /marketplace/integrations/:id/trendyol/sync-stock
   * Enqueues a SYNC_STOCK job and returns the job ID immediately.
   */
  async syncStock(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId, channel: 'TRENDYOL' },
    });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const body = await c.req.json<{ force?: boolean }>().catch((): { force?: boolean } => ({}));
    const jobId = await TrendyolWorker.enqueue(tenantId, id, SyncJobType.SYNC_STOCK, { force: body.force ?? false });

    return c.json({ data: { jobId, message: 'Stok senkronizasyonu kuyruğa alındı.' } }, 202);
  },

  /** GET /marketplace/integrations/:id/trendyol/jobs/:jobId — job status */
  async getJobStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const jobId = c.req.param('jobId')!;

    const job = await TrendyolWorker.getJob(jobId);
    if (!job || job.tenantId !== tenantId) return c.json(new NotFoundError('Job', jobId).toJSON(), 404);

    return c.json({ data: job });
  },

  /** GET /marketplace/integrations/:id/trendyol/batch/:batchRequestId */
  async getBatchResult(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;
    const batchRequestId = c.req.param('batchRequestId')!;

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId, channel: 'TRENDYOL' },
    });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    try {
      const creds = buildTrendyolCredentials(integration);
      const result = await TrendyolService.waitForBatch(creds, batchRequestId, { maxWaitMs: 30_000 });
      return c.json({ data: result });
    } catch (err) {
      return c.json(new ValidationError(err instanceof Error ? err.message : String(err)).toJSON(), 502);
    }
  },
};

export const TrendyolLookupController = {
  async categories(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;
    const query = c.req.query('q');
    const integration = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId, channel: 'TRENDYOL' } });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const data = await TrendyolService.searchCategories(buildTrendyolCredentials(integration), query);
    return c.json({ data });
  },

  async brands(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;
    const query = c.req.query('q')?.trim() ?? '';
    if (query.length < 2) return c.json({ data: [] });

    const integration = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId, channel: 'TRENDYOL' } });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const data = await TrendyolService.searchBrands(buildTrendyolCredentials(integration), query);
    return c.json({ data });
  },

  async attributes(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;
    const categoryId = Number(c.req.query('categoryId'));
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return c.json(new ValidationError('Geçerli categoryId zorunludur.').toJSON(), 400);
    }

    const integration = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId, channel: 'TRENDYOL' } });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const data = await TrendyolService.getCategoryAttributes(buildTrendyolCredentials(integration), categoryId);
    return c.json({ data });
  },

  async cargoProviders(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;
    const integration = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId, channel: 'TRENDYOL' } });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const data = await TrendyolService.getCargoProviders(buildTrendyolCredentials(integration));
    return c.json({ data });
  },
};

// ─────────────────────────────────────────────
// Marketplace Monitoring Controller
// Read-only endpoints for SyncJob, WebhookEvent, ListingSnapshot
// ─────────────────────────────────────────────

export const MarketplaceMonitoringController = {

  async health(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const integrations = await prisma.marketplaceIntegration.findMany({
      where: { tenantId },
      include: { _count: { select: { listings: true, orders: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const items: MarketplaceIntegrationHealthSummary[] = await Promise.all(
      integrations.map(async (integration) => {
        const [
          totalJobCount,
          failedJobCount,
          pendingJobCount,
          runningJobCount,
          lastDoneJob,
          lastFailedJob,
          webhookFailureCount,
          webhookReplayCount,
          latestJobWithResult,
        ] = await prisma.$transaction([
          prisma.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id } }),
          prisma.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id, status: SyncJobStatus.FAILED } }),
          prisma.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id, status: SyncJobStatus.PENDING } }),
          prisma.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id, status: SyncJobStatus.RUNNING } }),
          prisma.marketplaceSyncJob.findFirst({
            where: { tenantId, integrationId: integration.id, status: SyncJobStatus.DONE },
            orderBy: { finishedAt: 'desc' },
            select: { finishedAt: true },
          }),
          prisma.marketplaceSyncJob.findFirst({
            where: { tenantId, integrationId: integration.id, status: SyncJobStatus.FAILED },
            orderBy: { finishedAt: 'desc' },
            select: { finishedAt: true, updatedAt: true, errorMessage: true },
          }),
          prisma.marketplaceWebhookEvent.count({
            where: { tenantId, integrationId: integration.id, errorMessage: { not: null } },
          }),
          prisma.marketplaceWebhookEvent.count({
            where: {
              tenantId,
              integrationId: integration.id,
              OR: [{ processedAt: null }, { errorMessage: { not: null } }],
            },
          }),
          prisma.marketplaceSyncJob.findFirst({
            where: { tenantId, integrationId: integration.id, result: { not: Prisma.JsonNull } },
            orderBy: { updatedAt: 'desc' },
            select: { result: true },
          }),
        ]);

        const apiLimitRemaining = readJsonNumber(latestJobWithResult?.result ?? null, [
          'apiLimitRemaining',
          'rateLimitRemaining',
          'remainingRequests',
        ]);
        const apiLimitResetAt = readJsonString(latestJobWithResult?.result ?? null, [
          'apiLimitResetAt',
          'rateLimitResetAt',
          'resetAt',
        ]);

        return {
          integration: hideIntegrationSecrets(integration),
          lastSuccessfulSyncAt: integration.lastSyncAt ?? lastDoneJob?.finishedAt ?? null,
          lastErrorAt: lastFailedJob?.finishedAt ?? lastFailedJob?.updatedAt ?? null,
          lastErrorMessage: lastFailedJob?.errorMessage ?? null,
          errorRate: calculateErrorRate(totalJobCount, failedJobCount),
          pendingJobCount,
          runningJobCount,
          failedJobCount,
          retryAvailableCount: failedJobCount,
          webhookReplayCount,
          webhookFailureCount,
          apiLimit: {
            status: getApiLimitStatus(apiLimitRemaining),
            remaining: apiLimitRemaining,
            resetAt: apiLimitResetAt,
          },
        };
      }),
    );

    const totals = items.reduce(
      (acc, item) => ({
        integrations: acc.integrations + 1,
        pendingJobs: acc.pendingJobs + item.pendingJobCount,
        runningJobs: acc.runningJobs + item.runningJobCount,
        failedJobs: acc.failedJobs + item.failedJobCount,
        retryAvailable: acc.retryAvailable + item.retryAvailableCount,
        webhookReplayAvailable: acc.webhookReplayAvailable + item.webhookReplayCount,
        webhookFailures: acc.webhookFailures + item.webhookFailureCount,
      }),
      {
        integrations: 0,
        pendingJobs: 0,
        runningJobs: 0,
        failedJobs: 0,
        retryAvailable: 0,
        webhookReplayAvailable: 0,
        webhookFailures: 0,
      },
    );

    return c.json({ data: { totals, items } });
  },

  // ── Sync Jobs ─────────────────────────────────

  async listSyncJobs(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const integrationId = c.req.query('integrationId');
    const statusRaw = c.req.query('status');
    const jobTypeRaw = c.req.query('jobType');

    const status = statusRaw as SyncJobStatus | undefined;
    const jobType = jobTypeRaw as SyncJobType | undefined;

    const where = {
      tenantId,
      ...(integrationId && { integrationId }),
      ...(status && { status }),
      ...(jobType && { jobType }),
    };

    const [total, jobs] = await prisma.$transaction([
      prisma.marketplaceSyncJob.count({ where }),
      prisma.marketplaceSyncJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return c.json({ data: jobs, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getSyncJob(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const job = await prisma.marketplaceSyncJob.findFirst({ where: { id, tenantId } });
    if (!job) return c.json(new NotFoundError('Sync Job', id).toJSON(), 404);

    return c.json({ data: job });
  },

  async retrySyncJob(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const job = await prisma.marketplaceSyncJob.findFirst({ where: { id, tenantId } });
    if (!job) return c.json(new NotFoundError('Sync Job', id).toJSON(), 404);
    if (job.status !== SyncJobStatus.FAILED) {
      return c.json(new ValidationError('Sadece başarısız job tekrar kuyruğa alınabilir.').toJSON(), 400);
    }

    const jobId = await TrendyolWorker.enqueue(
      tenantId,
      job.integrationId,
      job.jobType,
      toJobParams(job.params ?? {}),
    );

    return c.json({ data: { jobId, message: 'Sync job tekrar kuyruğa alındı.' } }, 202);
  },

  // ── Webhook Events ────────────────────────────

  async listWebhookEvents(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const integrationId = c.req.query('integrationId');
    const eventType = c.req.query('eventType');
    const processed = c.req.query('processed');

    const where = {
      tenantId,
      ...(integrationId && { integrationId }),
      ...(eventType && { eventType }),
      ...(processed === 'true' && { processedAt: { not: null } }),
      ...(processed === 'false' && { processedAt: null }),
    };

    const [total, events] = await prisma.$transaction([
      prisma.marketplaceWebhookEvent.count({ where }),
      prisma.marketplaceWebhookEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return c.json({ data: events, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getWebhookEvent(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const event = await prisma.marketplaceWebhookEvent.findFirst({ where: { id, tenantId } });
    if (!event) return c.json(new NotFoundError('Webhook Event', id).toJSON(), 404);

    return c.json({ data: event });
  },

  async replayWebhookEvent(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const event = await prisma.marketplaceWebhookEvent.findFirst({
      where: { id, tenantId },
      include: {
        integration: { select: { id: true, channel: true, isActive: true } },
      },
    });
    if (!event) return c.json(new NotFoundError('Webhook Event', id).toJSON(), 404);
    if (event.integration.channel !== MarketplaceChannel.TRENDYOL) {
      return c.json(new ValidationError('Webhook replay su anda sadece Trendyol icin desteklenir.').toJSON(), 400);
    }
    if (!event.integration.isActive) {
      return c.json(new ValidationError('Pasif entegrasyon icin webhook replay yapilamaz.').toJSON(), 400);
    }

    try {
      const results = await processTrendyolWebhookPayload({
        tenantId,
        integrationId: event.integrationId,
        payload: event.payload,
        replayProcessed: true,
      });
      return c.json({
        data: {
          replayed: results.filter((result) => !result.duplicate && result.error === null).length,
          failed: results.filter((result) => result.error !== null).length,
          results,
        },
      });
    } catch (err) {
      return c.json(new ValidationError(err instanceof Error ? err.message : 'Webhook replay basarisiz.').toJSON(), 400);
    }
  },

  // ── Listing Snapshots ─────────────────────────

  async listSnapshots(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const integrationId = c.req.query('integrationId');

    const where = {
      tenantId,
      ...(integrationId && { listing: { integrationId } }),
    };

    const [total, snapshots] = await prisma.$transaction([
      prisma.marketplaceListingSnapshot.count({ where }),
      prisma.marketplaceListingSnapshot.findMany({
        where,
        include: {
          listing: { select: { id: true, externalId: true, externalSku: true, price: true, isActive: true } },
        },
        orderBy: { lastSentAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return c.json({ data: snapshots, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },
};
