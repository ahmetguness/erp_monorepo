import { Context } from 'hono';
import { MarketplaceChannel, MarketplaceOrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import {
  TrendyolService,
  buildTrendyolCredentials,
} from '../services/trendyol.service';

// ─────────────────────────────────────────────
// Marketplace Controller — Entegrasyon, Listeleme, Sipariş
// ─────────────────────────────────────────────

export const MarketplaceIntegrationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const data = await prisma.marketplaceIntegration.findMany({
      where: { tenantId },
      include: { _count: { select: { listings: true, orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({ data });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { listings: true, orders: true } },
        listings: { take: 5, orderBy: { lastSyncAt: 'desc' }, include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!integration) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);
    return c.json({ data: integration });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const body = await c.req.json<{
      channel: MarketplaceChannel; name: string;
      apiKey?: string; apiSecret?: string; storeId?: string;
    }>();
    if (!body.channel || !body.name) return c.json(new ValidationError('channel ve name zorunludur.').toJSON(), 400);

    const exists = await prisma.marketplaceIntegration.findUnique({
      where: { tenantId_channel: { tenantId, channel: body.channel } },
    });
    if (exists) return c.json(new ValidationError(`${body.channel} kanalı zaten bağlı.`).toJSON(), 400);

    const integration = await prisma.marketplaceIntegration.create({
      data: {
        tenantId, channel: body.channel, name: body.name,
        apiKey: body.apiKey ?? null, apiSecret: body.apiSecret ?? null, storeId: body.storeId ?? null,
      },
    });
    return c.json({ data: integration }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);

    const body = await c.req.json<{ name?: string; apiKey?: string; apiSecret?: string; storeId?: string; isActive?: boolean }>();
    const updated = await prisma.marketplaceIntegration.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.apiKey !== undefined && { apiKey: body.apiKey }),
        ...(body.apiSecret !== undefined && { apiSecret: body.apiSecret }),
        ...(body.storeId !== undefined && { storeId: body.storeId }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);

    await prisma.marketplaceIntegration.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Marketplace Listing Controller
// ─────────────────────────────────────────────

export const MarketplaceListingController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
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
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const body = await c.req.json<{
      integrationId: string; productId: string; externalId: string;
      externalSku?: string; price: number; stock?: number;
    }>();
    if (!body.integrationId || !body.productId || !body.externalId || body.price == null) {
      return c.json(new ValidationError('integrationId, productId, externalId ve price zorunludur.').toJSON(), 400);
    }

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

  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

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
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

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
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
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
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

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
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

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
};

// ─────────────────────────────────────────────
// Trendyol Sync Controller — queue-based
// ─────────────────────────────────────────────

import { TrendyolWorker } from '../services/trendyol-worker.service';

export const TrendyolSyncController = {

  /** POST /marketplace/integrations/:id/trendyol/test */
  async testConnection(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

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
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId, channel: 'TRENDYOL' },
    });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const body = await c.req.json<{ hoursBack?: number; status?: string }>().catch(() => ({}));
    const jobId = await TrendyolWorker.enqueue(tenantId, id, 'SYNC_ORDERS', {
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
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId, channel: 'TRENDYOL' },
    });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const body = await c.req.json<{ force?: boolean }>().catch(() => ({}));
    const jobId = await TrendyolWorker.enqueue(tenantId, id, 'SYNC_STOCK', { force: body.force ?? false });

    return c.json({ data: { jobId, message: 'Stok senkronizasyonu kuyruğa alındı.' } }, 202);
  },

  /** GET /marketplace/integrations/:id/trendyol/jobs/:jobId — job status */
  async getJobStatus(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const jobId = c.req.param('jobId')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const job = await TrendyolWorker.getJob(jobId);
    if (!job || job.tenantId !== tenantId) return c.json(new NotFoundError('Job', jobId).toJSON(), 404);

    return c.json({ data: job });
  },

  /** GET /marketplace/integrations/:id/trendyol/batch/:batchRequestId */
  async getBatchResult(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    const batchRequestId = c.req.param('batchRequestId')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

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
