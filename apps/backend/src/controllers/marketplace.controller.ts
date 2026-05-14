import { Context } from 'hono';
import { MarketplaceChannel, MarketplaceOrderStatus, Prisma, SyncJobType, SyncJobStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import {
  TrendyolService,
  buildTrendyolCredentials,
} from '../services/trendyol.service';
import { TrendyolWorker } from '../services/trendyol-worker.service';
import type { JobParams } from '../services/trendyol-worker.service';
import { requireTenantId } from '../utils/context.js';
import { getPaginationParams } from '../utils/pagination.js';

type IntegrationWithSecrets = {
  apiKey: string | null;
  apiSecret: string | null;
};

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

function toJobParams(value: Prisma.JsonValue): JobParams {
  return isJsonObject(value) ? value : {};
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
    return c.json({ data: hideIntegrationSecrets(integration) }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

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
    return c.json({ data: hideIntegrationSecrets(updated) });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

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

// ─────────────────────────────────────────────
// Marketplace Monitoring Controller
// Read-only endpoints for SyncJob, WebhookEvent, ListingSnapshot
// ─────────────────────────────────────────────

export const MarketplaceMonitoringController = {

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
