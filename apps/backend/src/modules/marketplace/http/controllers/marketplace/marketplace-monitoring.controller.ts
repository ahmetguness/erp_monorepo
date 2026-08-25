import { Context } from 'hono';
import { AuditAction, EntityType, MarketplaceChannel, MarketplaceOrderStatus, Prisma, SyncJobType, SyncJobStatus } from '@prisma/client';
import { prisma } from '../../../../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../../../../errors/index.js';
import {
  TrendyolService,
  buildTrendyolCredentials,
} from '../../../../../services/trendyol.service.js';
import type { TrendyolProductItemInput } from '../../../../../services/trendyol.service.js';
import { TrendyolWorker } from '../../../../../services/trendyol-worker.service.js';
import type { JobParams } from '../../../../../services/trendyol-worker.service.js';
import { requireTenantId, requireUserId, requireParam } from '../../../../../utils/context.js';
import { getPaginationParams } from '../../../../../utils/pagination.js';
import { encrypt } from '../../../../../utils/encryption.js';
import { createAuditLog, getRequestMeta } from '../../../../../utils/audit.js';
import { processTrendyolWebhookPayload } from '../trendyol-webhook.controller.js';
import { MarketplaceMonitoringService } from '../../../../../services/marketplace-monitoring.service.js';
import { MarketplaceAutomationService } from '../../../../../services/marketplace-automation.service.js';
import { marketplaceMonitoringService, marketplaceAutomationService, hideIntegrationSecrets, isJsonObject, isMarketplaceChannel, readOptionalString, parseCreateIntegrationBody, parseUpdateIntegrationBody, toJobParams, parsePositiveNumber, toTrendyolProductItem } from './shared.js';
import type { IntegrationWithSecrets, TrendyolListingProductDTO, MarketplaceListingActionListing, MarketplaceListingActionResult, CreateIntegrationBody, UpdateIntegrationBody } from './shared.js';

export const MarketplaceMonitoringController = {

  async health(c: Context): Promise<Response> {
    const data = await marketplaceMonitoringService.health(requireTenantId(c));
    return c.json({ data });
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
    const id = requireParam(c, 'id');

    const job = await prisma.marketplaceSyncJob.findFirst({ where: { id, tenantId } });
    if (!job) return c.json(new NotFoundError('Sync Job', id).toJSON(), 404);

    return c.json({ data: job });
  },

  async retrySyncJob(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

    const event = await prisma.marketplaceWebhookEvent.findFirst({ where: { id, tenantId } });
    if (!event) return c.json(new NotFoundError('Webhook Event', id).toJSON(), 404);

    return c.json({ data: event });
  },

  async replayWebhookEvent(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

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

  async driftReport(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const integrationId = c.req.query('integrationId');
    const data = await marketplaceMonitoringService.driftReport(tenantId, integrationId);
    return c.json({ data });
  },

  // ── Phase 12 - Marketplace Automation ───────

  async getAutomationSummary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const summary = await marketplaceAutomationService.getAutomationSummary(tenantId);
    return c.json({ data: summary });
  },

  async getAutomationPolicy(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const policy = await marketplaceAutomationService.getPolicy(tenantId);
    return c.json({ data: policy });
  },

  async updateAutomationPolicy(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<Record<string, boolean>>().catch(() => ({}));
    const updated = await marketplaceAutomationService.updatePolicy(tenantId, body);
    return c.json({ data: updated });
  },

  async triggerOrderAutomation(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const marketplaceOrderId = requireParam(c, 'id');
    const result = await marketplaceAutomationService.processOrderAutomation(tenantId, marketplaceOrderId);
    return c.json({ data: result });
  },

  async triggerStockSync(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const productId = requireParam(c, 'productId');
    const result = await marketplaceAutomationService.syncErpStockToMarketplaces(tenantId, productId);
    return c.json({ data: result });
  },
};
