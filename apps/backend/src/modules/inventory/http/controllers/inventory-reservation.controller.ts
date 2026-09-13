import { ReservationRefType } from '@prisma/client';
import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { InventoryReservationService } from '../../../../services/inventory-reservation.service.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';
import { parseReleaseReservation,parseReserveStock } from '../../application/operations/index.js';
import { inventoryApplication } from '../../composition.js';

interface ReservationListQuery {
  page?: string;
  limit?: string;
  productId?: string;
  warehouseId?: string;
  refType?: ReservationRefType;
  active?: string;
}

interface SalesOrderReservationDTO {
  orderId: string;
  warehouseId: string;
  allowPartial?: boolean;
  expiresAt?: string;
}

const reservationService = new InventoryReservationService(prisma);

export const InventoryReservationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query() as ReservationListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const where = {
      tenantId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.refType ? { refType: query.refType } : {}),
      ...(query.active === 'true' ? { releasedAt: null } : {}),
      ...(query.active === 'false' ? { releasedAt: { not: null } } : {}),
    };
    const [total, reservations] = await prisma.$transaction([
      prisma.inventoryReservation.count({ where }),
      prisma.inventoryReservation.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { reservedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return c.json({ data: reservations, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async create(c: Context): Promise<Response> {
    const context = { tenantId: requireTenantId(c), userId: requireUserId(c) };
    const reservation = await inventoryApplication.reserveStock.execute(
      context,
      parseReserveStock(await c.req.json<unknown>()),
    );
    return c.json({ data: reservation }, 201);
  },

  async createFromSalesOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<SalesOrderReservationDTO>();
    const result = await reservationService.createSalesOrderReservations(tenantId, userId, {
      orderId: body.orderId,
      warehouseId: body.warehouseId,
      allowPartial: body.allowPartial ?? true,
      expiresAt: body.expiresAt ?? null,
    });
    return c.json({ data: result }, 201);
  },

  async report(c: Context): Promise<Response> {
    return c.json({ data: await reservationService.getReport(requireTenantId(c)) });
  },

  async releaseExpired(c: Context): Promise<Response> {
    return c.json({ data: await reservationService.releaseExpired(requireTenantId(c)) });
  },

  async release(c: Context): Promise<Response> {
    const reservation = await inventoryApplication.releaseReservation.execute(
      requireTenantId(c),
      parseReleaseReservation(requireParam(c, 'id')),
    );
    return c.json({ data: reservation });
  },
};
