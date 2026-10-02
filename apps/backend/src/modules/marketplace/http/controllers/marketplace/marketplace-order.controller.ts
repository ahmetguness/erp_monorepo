import { AuditAction,EntityType,MarketplaceChannel,MarketplaceOrderStatus } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../../utils/context.js';
import { getPaginationParams } from '../../../../../utils/pagination.js';
import { createAuditLog,getRequestMeta } from '../../../../../utils/audit.js';

export const MarketplaceOrderController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query('status') as MarketplaceOrderStatus | undefined;
    const channel = c.req.query('channel') as MarketplaceChannel | undefined;
    if (status && !Object.values(MarketplaceOrderStatus).includes(status)) return c.json(new ValidationError('Geçersiz status filtresi.').toJSON(), 400);
    if (channel && !Object.values(MarketplaceChannel).includes(channel)) return c.json(new ValidationError('Geçersiz channel filtresi.').toJSON(), 400);

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
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const order = await prisma.marketplaceOrder.findFirst({ where: { id, tenantId } });
    if (!order) return c.json(new NotFoundError('Pazaryeri Siparişi', id).toJSON(), 404);

    const body = await c.req.json<{ status: MarketplaceOrderStatus }>().catch(() => null);
    if (!body?.status || !Object.values(MarketplaceOrderStatus).includes(body.status)) return c.json(new ValidationError('Geçerli bir status zorunludur.').toJSON(), 400);
    if (order.status === body.status) return c.json({ data: order });

    const updated = await prisma.marketplaceOrder.update({
      where: { id },
      data: { status: body.status },
    });
    await createAuditLog(prisma, { tenantId, userId, module: 'marketplace', entityType: EntityType.OTHER, entityId: id, action: AuditAction.UPDATE, oldValues: { status: order.status }, newValues: { status: updated.status }, ...getRequestMeta(c) });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const order = await prisma.marketplaceOrder.findFirst({ where: { id, tenantId } });
    if (!order) return c.json(new NotFoundError('Pazaryeri Siparişi', id).toJSON(), 404);

    const terminalStatuses: MarketplaceOrderStatus[] = ['DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'];
    if (!terminalStatuses.includes(order.status)) {
      return c.json(new ValidationError('Sadece tamamlanmış, iptal edilmiş veya iade edilmiş siparişler silinebilir.').toJSON(), 400);
    }

    await prisma.marketplaceOrder.delete({ where: { id } });
    await createAuditLog(prisma, { tenantId, userId, module: 'marketplace', entityType: EntityType.OTHER, entityId: id, action: AuditAction.DELETE, oldValues: { externalId: order.externalId, status: order.status, totalAmount: Number(order.totalAmount) }, ...getRequestMeta(c) });
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Trendyol Sync Controller — queue-based
// ─────────────────────────────────────────────
