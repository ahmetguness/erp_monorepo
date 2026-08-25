import { Context } from 'hono';
import { AuditAction, EntityType, MarketplaceChannel, MarketplaceOrderStatus, Prisma, SyncJobType, SyncJobStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { NotFoundError, ValidationError } from '../../../errors';
import {
  TrendyolService,
  buildTrendyolCredentials,
} from '../../trendyol.service';
import type { TrendyolProductItemInput } from '../../trendyol.service';
import { TrendyolWorker } from '../../trendyol-worker.service';
import type { JobParams } from '../../trendyol-worker.service';
import { requireTenantId, requireUserId, requireParam } from '../../../utils/context.js';
import { getPaginationParams } from '../../../utils/pagination.js';
import { encrypt } from '../../../utils/encryption.js';
import { createAuditLog, getRequestMeta } from '../../../utils/audit.js';
import { processTrendyolWebhookPayload } from '../trendyol-webhook.controller.service.js';
import { MarketplaceMonitoringService } from '../../marketplace-monitoring.service.js';
import { MarketplaceAutomationService } from '../../marketplace-automation.service.js';
import { marketplaceMonitoringService, marketplaceAutomationService, hideIntegrationSecrets, isJsonObject, isMarketplaceChannel, readOptionalString, parseCreateIntegrationBody, parseUpdateIntegrationBody, toJobParams, parsePositiveNumber, toTrendyolProductItem } from './shared.js';
import type { IntegrationWithSecrets, TrendyolListingProductDTO, MarketplaceListingActionListing, MarketplaceListingActionResult, CreateIntegrationBody, UpdateIntegrationBody } from './shared.js';

export const TrendyolSyncController = {

  /** POST /marketplace/integrations/:id/trendyol/test */
  async testConnection(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
    const jobId = requireParam(c, 'jobId');

    const job = await TrendyolWorker.getJob(jobId, tenantId);
    if (!job) return c.json(new NotFoundError('Job', jobId).toJSON(), 404);

    return c.json({ data: job });
  },

  /** GET /marketplace/integrations/:id/trendyol/batch/:batchRequestId */
  async getBatchResult(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const batchRequestId = requireParam(c, 'batchRequestId');

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
