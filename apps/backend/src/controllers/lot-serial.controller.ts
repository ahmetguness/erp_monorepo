import { Context } from 'hono';
import { LotUsedRefType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireParam } from '../utils/context.js';
import { LotSerialTraceabilityService } from '../services/lot-serial-traceability.service';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface LotSerialListQuery {
  page?: string;
  limit?: string;
  productId?: string;
  batchId?: string;
  isUsed?: string;
}

interface TraceabilityQuery {
  lotId?: string;
  batchId?: string;
  productId?: string;
}

interface CreateLotSerialDTO {
  productId: string;
  batchId?: string;
  serialNumber: string;
}

interface AssignToMovementDTO {
  usedRefType: LotUsedRefType;
  usedRefId: string;
}

// ─────────────────────────────────────────────
// Lot / Serial Number Controller
// ─────────────────────────────────────────────

const traceabilityService = new LotSerialTraceabilityService(prisma);

export const LotSerialController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as LotSerialListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.productId && { productId: query.productId }),
      ...(query.batchId && { batchId: query.batchId }),
      ...(query.isUsed !== undefined && { isUsed: query.isUsed === 'true' }),
    };

    const [total, lots] = await prisma.$transaction([
      prisma.lotSerialNumber.count({ where }),
      prisma.lotSerialNumber.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          batch: { select: { id: true, batchNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: lots,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateLotSerialDTO>();

    if (!body.productId || !body.serialNumber) {
      return c.json(
        new ValidationError('productId ve serialNumber zorunludur.').toJSON(),
        400,
      );
    }

    const lot = await prisma.lotSerialNumber.create({
      data: {
        tenantId,
        productId: body.productId,
        batchId: body.batchId ?? null,
        serialNumber: body.serialNumber,
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
        batch: { select: { id: true, batchNumber: true } },
      },
    });

    return c.json({ data: lot }, 201);
  },

  async traceability(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query() as TraceabilityQuery;
    const report = await traceabilityService.getReport(tenantId, {
      lotId: query.lotId,
      batchId: query.batchId,
      productId: query.productId,
    });
    return c.json({ data: report });
  },

  async assignToMovement(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.lotSerialNumber.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return c.json(new NotFoundError('Lot/Seri No', id).toJSON(), 404);

    if (existing.isUsed) {
      return c.json(new ValidationError('Bu lot/seri numarası zaten kullanılmış.').toJSON(), 400);
    }

    const body = await c.req.json<AssignToMovementDTO>();

    if (!body.usedRefType || !body.usedRefId) {
      return c.json(new ValidationError('usedRefType ve usedRefId zorunludur.').toJSON(), 400);
    }

    const updated = await prisma.lotSerialNumber.update({
      where: { id },
      data: {
        isUsed: true,
        usedAt: new Date(),
        usedRefType: body.usedRefType,
        usedRefId: body.usedRefId,
      },
    });

    return c.json({ data: updated });
  },
};
