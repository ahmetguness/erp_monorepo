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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
