import { Context } from 'hono';
import { ReservationRefType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { assertCanReserveStock } from '../services/inventory-rules.service';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface ReservationListQuery {
  page?: string;
  limit?: string;
  productId?: string;
  warehouseId?: string;
  refType?: ReservationRefType;
  active?: string;
}

interface CreateReservationDTO {
  productId: string;
  warehouseId: string;
  quantity: number;
  refType: ReservationRefType;
  refId: string;
  notes?: string;
  expiresAt?: string;
}

// ─────────────────────────────────────────────
// Inventory Reservation Controller
// ─────────────────────────────────────────────

export const InventoryReservationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ReservationListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.productId && { productId: query.productId }),
      ...(query.warehouseId && { warehouseId: query.warehouseId }),
      ...(query.refType && { refType: query.refType }),
      ...(query.active === 'true' && { releasedAt: null }),
      ...(query.active === 'false' && { releasedAt: { not: null } }),
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
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: reservations,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const body = await c.req.json<CreateReservationDTO>();

    if (!body.productId || !body.warehouseId || !body.quantity || !body.refType || !body.refId) {
      return c.json(
        new ValidationError('productId, warehouseId, quantity, refType ve refId zorunludur.').toJSON(),
        400,
      );
    }

    if (body.quantity <= 0) {
      return c.json(new ValidationError('Miktar 0\'dan büyük olmalıdır.').toJSON(), 400);
    }

    await assertCanReserveStock(prisma, tenantId, {
      productId: body.productId,
      warehouseId: body.warehouseId,
      quantity: body.quantity,
      refType: body.refType,
      refId: body.refId,
    });

    const reservation = await prisma.inventoryReservation.create({
      data: {
        tenantId,
        productId: body.productId,
        warehouseId: body.warehouseId,
        quantity: body.quantity,
        refType: body.refType,
        refId: body.refId,
        notes: body.notes ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: userId,
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    return c.json({ data: reservation }, 201);
  },

  async release(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.inventoryReservation.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return c.json(new NotFoundError('Rezervasyon', id).toJSON(), 404);

    if (existing.releasedAt) {
      return c.json(new ValidationError('Rezervasyon zaten serbest bırakılmış.').toJSON(), 400);
    }

    const updated = await prisma.inventoryReservation.update({
      where: { id },
      data: { releasedAt: new Date() },
    });

    return c.json({ data: updated });
  },
};
