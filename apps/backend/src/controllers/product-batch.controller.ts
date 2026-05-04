import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface ProductBatchListQuery {
  page?: string;
  limit?: string;
  productId?: string;
}

interface CreateProductBatchDTO {
  productId: string;
  batchNumber: string;
  expiryDate?: string;
  manufacturedAt?: string;
  quantity?: number;
  notes?: string;
}

interface UpdateProductBatchDTO {
  expiryDate?: string;
  manufacturedAt?: string;
  quantity?: number;
  notes?: string;
}

// ─────────────────────────────────────────────
// Product Batch Controller
// ─────────────────────────────────────────────

export const ProductBatchController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ProductBatchListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.productId && { productId: query.productId }),
    };

    const [total, batches] = await prisma.$transaction([
      prisma.productBatch.count({ where }),
      prisma.productBatch.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          _count: { select: { lots: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: batches,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateProductBatchDTO>();

    if (!body.productId || !body.batchNumber) {
      return c.json(
        new ValidationError('productId ve batchNumber zorunludur.').toJSON(),
        400,
      );
    }

    const batch = await prisma.productBatch.create({
      data: {
        tenantId,
        productId: body.productId,
        batchNumber: body.batchNumber,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        manufacturedAt: body.manufacturedAt ? new Date(body.manufacturedAt) : null,
        quantity: body.quantity ?? 0,
        notes: body.notes ?? null,
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
      },
    });

    return c.json({ data: batch }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.productBatch.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return c.json(new NotFoundError('Parti', id).toJSON(), 404);

    const body = await c.req.json<UpdateProductBatchDTO>();

    const updated = await prisma.productBatch.update({
      where: { id },
      data: {
        ...(body.expiryDate !== undefined && { expiryDate: body.expiryDate ? new Date(body.expiryDate) : null }),
        ...(body.manufacturedAt !== undefined && { manufacturedAt: body.manufacturedAt ? new Date(body.manufacturedAt) : null }),
        ...(body.quantity !== undefined && { quantity: body.quantity }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
      },
    });

    return c.json({ data: updated });
  },
};
