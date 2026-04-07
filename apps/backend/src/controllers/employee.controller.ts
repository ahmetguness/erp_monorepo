import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// Employee Controller — Personel CRUD
// ─────────────────────────────────────────────

export const EmployeeController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
    const department = c.req.query('department');
    const isActive = c.req.query('isActive');

    const where = {
      tenantId, deletedAt: null,
      ...(department && { department }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
    };

    const [total, data] = await prisma.$transaction([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        include: {
          _count: { select: { leaveRequests: true, payrolls: true } },
        },
        orderBy: { lastName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const employee = await prisma.employee.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        leaveRequests: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 },
        payrolls: { where: { deletedAt: null }, orderBy: { period: 'desc' }, take: 12, include: { items: true } },
        attendances: { orderBy: { date: 'desc' }, take: 30 },
      },
    });
    if (!employee) return c.json(new NotFoundError('Personel', id).toJSON(), 404);
    return c.json({ data: employee });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const body = await c.req.json<{
      firstName: string; lastName: string; email?: string; phone?: string;
      position?: string; department?: string; hireDate: string; salary?: number;
    }>();
    if (!body.firstName || !body.lastName || !body.hireDate) {
      return c.json(new ValidationError('firstName, lastName ve hireDate zorunludur.').toJSON(), 400);
    }

    const employee = await prisma.employee.create({
      data: {
        tenantId, firstName: body.firstName, lastName: body.lastName,
        email: body.email ?? null, phone: body.phone ?? null,
        position: body.position ?? null, department: body.department ?? null,
        hireDate: new Date(body.hireDate), salary: body.salary ?? 0,
      },
    });
    return c.json({ data: employee }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.employee.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Personel', id).toJSON(), 404);

    const body = await c.req.json<{
      firstName?: string; lastName?: string; email?: string; phone?: string;
      position?: string; department?: string; salary?: number;
      isActive?: boolean; leaveDate?: string;
    }>();

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.department !== undefined && { department: body.department }),
        ...(body.salary !== undefined && { salary: body.salary }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.leaveDate !== undefined && { leaveDate: body.leaveDate ? new Date(body.leaveDate) : null }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.employee.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Personel', id).toJSON(), 404);

    await prisma.employee.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return c.json({ data: { success: true } });
  },

  async departments(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const result = await prisma.employee.groupBy({
      by: ['department'],
      where: { tenantId, deletedAt: null, department: { not: null } },
      _count: { id: true },
    });
    const departments = result.map((r) => ({ name: r.department, count: r._count.id }));
    return c.json({ data: departments });
  },
};
