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

export const TrendyolLookupController = {
  async categories(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const query = c.req.query('q');
    const integration = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId, channel: 'TRENDYOL' } });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const data = await TrendyolService.searchCategories(buildTrendyolCredentials(integration), query);
    return c.json({ data });
  },

  async brands(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const query = c.req.query('q')?.trim() ?? '';
    if (query.length < 2) return c.json({ data: [] });

    const integration = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId, channel: 'TRENDYOL' } });
    if (!integration) return c.json(new NotFoundError('Trendyol entegrasyonu', id).toJSON(), 404);

    const data = await TrendyolService.searchBrands(buildTrendyolCredentials(integration), query);
    return c.json({ data });
  },

  async attributes(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
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
    const id = requireParam(c, 'id');
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
