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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

    const existing = await prisma.marketplaceListing.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);

    await prisma.marketplaceListing.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Marketplace Order Controller
// ─────────────────────────────────────────────
