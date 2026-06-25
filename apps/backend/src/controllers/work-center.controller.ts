import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId, requireParam } from '../utils/context.js';

// ─────────────────────────────────────────────
// Work Center Controller — İş merkezi CRUD
// ─────────────────────────────────────────────

export const WorkCenterController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 50);

    const [total, data] = await prisma.$transaction([
      prisma.workCenter.count({ where: { tenantId } }),
      prisma.workCenter.findMany({
        where: { tenantId },
        include: { _count: { select: { operations: true, workOrderOps: true } } },
        orderBy: { code: 'asc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const wc = await prisma.workCenter.findFirst({
      where: { id, tenantId },
      include: { operations: { include: { bom: { select: { id: true, name: true } } }, orderBy: { stepOrder: 'asc' } } },
    });
    if (!wc) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);
    return c.json({ data: wc });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ code: string; name: string; description?: string; capacity?: number; laborRate?: number; overheadRate?: number }>();
    if (!body.code || !body.name) return c.json(new ValidationError('code ve name zorunludur.').toJSON(), 400);

    const exists = await prisma.workCenter.findUnique({ where: { tenantId_code: { tenantId, code: body.code } } });
    if (exists) return c.json(new ValidationError('Bu kodla iş merkezi zaten mevcut.').toJSON(), 400);

    const wc = await prisma.workCenter.create({
      data: { tenantId, code: body.code, name: body.name, description: body.description ?? null, capacity: body.capacity ?? null, laborRate: body.laborRate ?? null, overheadRate: body.overheadRate ?? null },
    });
    return c.json({ data: wc }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.workCenter.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);

    const body = await c.req.json<{ name?: string; description?: string; capacity?: number; isActive?: boolean; laborRate?: number; overheadRate?: number }>();
    const updated = await prisma.workCenter.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.laborRate !== undefined && { laborRate: body.laborRate }),
        ...(body.overheadRate !== undefined && { overheadRate: body.overheadRate }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.workCenter.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);

    const usedInOps = await prisma.workOrderOperation.count({ where: { tenantId, workCenterId: id } });
    if (usedInOps > 0) return c.json(new ValidationError('Aktif iş emirlerinde kullanılan iş merkezi silinemez.').toJSON(), 400);

    await prisma.workCenter.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },

  async getCapacityCalendar(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const capacities = await prisma.workCenterCapacity.findMany({
      where: { tenantId, workCenterId: id },
      orderBy: { date: 'asc' },
    });

    return c.json({ data: capacities });
  },
};
