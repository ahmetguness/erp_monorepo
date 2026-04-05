import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// Work Center Controller — İş merkezi CRUD
// ─────────────────────────────────────────────

export const WorkCenterController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));

    const [total, data] = await prisma.$transaction([
      prisma.workCenter.count({ where: { tenantId } }),
      prisma.workCenter.findMany({
        where: { tenantId },
        include: { _count: { select: { operations: true, workOrderOps: true } } },
        orderBy: { code: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const wc = await prisma.workCenter.findFirst({
      where: { id, tenantId },
      include: { operations: { include: { bom: { select: { id: true, name: true } } }, orderBy: { stepOrder: 'asc' } } },
    });
    if (!wc) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);
    return c.json({ data: wc });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const body = await c.req.json<{ code: string; name: string; description?: string; capacity?: number }>();
    if (!body.code || !body.name) return c.json(new ValidationError('code ve name zorunludur.').toJSON(), 400);

    const exists = await prisma.workCenter.findUnique({ where: { tenantId_code: { tenantId, code: body.code } } });
    if (exists) return c.json(new ValidationError('Bu kodla iş merkezi zaten mevcut.').toJSON(), 400);

    const wc = await prisma.workCenter.create({
      data: { tenantId, code: body.code, name: body.name, description: body.description ?? null, capacity: body.capacity ?? null },
    });
    return c.json({ data: wc }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.workCenter.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);

    const body = await c.req.json<{ name?: string; description?: string; capacity?: number; isActive?: boolean }>();
    const updated = await prisma.workCenter.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.workCenter.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);

    const usedInOps = await prisma.workOrderOperation.count({ where: { workCenterId: id } });
    if (usedInOps > 0) return c.json(new ValidationError('Aktif iş emirlerinde kullanılan iş merkezi silinemez.').toJSON(), 400);

    await prisma.workCenter.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};
