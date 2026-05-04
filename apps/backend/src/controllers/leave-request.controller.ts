import { Context } from 'hono';
import { LeaveType, LeaveStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// Leave Request Controller — İzin talebi CRUD + onay
// ─────────────────────────────────────────────

export const LeaveRequestController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query('status') as LeaveStatus | undefined;
    const employeeId = c.req.query('employeeId');

    const where = {
      tenantId, deletedAt: null,
      ...(status && { status }),
      ...(employeeId && { employeeId }),
    };

    const [total, data] = await prisma.$transaction([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, department: true, position: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const lr = await prisma.leaveRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: true, position: true, email: true } },
      },
    });
    if (!lr) return c.json(new NotFoundError('İzin Talebi', id).toJSON(), 404);
    return c.json({ data: lr });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      employeeId: string; type: LeaveType; startDate: string; endDate: string;
      days: number; notes?: string;
    }>();
    if (!body.employeeId || !body.type || !body.startDate || !body.endDate || !body.days) {
      return c.json(new ValidationError('employeeId, type, startDate, endDate ve days zorunludur.').toJSON(), 400);
    }

    // Çakışma kontrolü
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: body.employeeId, tenantId, deletedAt: null,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { startDate: { lte: new Date(body.endDate) }, endDate: { gte: new Date(body.startDate) } },
        ],
      },
    });
    if (overlap) return c.json(new ValidationError('Bu tarih aralığında zaten bir izin talebi mevcut.').toJSON(), 400);

    const lr = await prisma.leaveRequest.create({
      data: {
        tenantId, employeeId: body.employeeId, type: body.type,
        startDate: new Date(body.startDate), endDate: new Date(body.endDate),
        days: body.days, notes: body.notes ?? null,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return c.json({ data: lr }, 201);
  },

  async approve(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const lr = await prisma.leaveRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!lr) return c.json(new NotFoundError('İzin Talebi', id).toJSON(), 404);
    if (lr.status !== 'PENDING') return c.json(new ValidationError('Sadece bekleyen talepler onaylanabilir.').toJSON(), 400);

    const body = await c.req.json<{ approvedBy?: string }>();
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: body.approvedBy ?? null, approvedAt: new Date() },
    });
    return c.json({ data: updated });
  },

  async reject(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const lr = await prisma.leaveRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!lr) return c.json(new NotFoundError('İzin Talebi', id).toJSON(), 404);
    if (lr.status !== 'PENDING') return c.json(new ValidationError('Sadece bekleyen talepler reddedilebilir.').toJSON(), 400);

    const updated = await prisma.leaveRequest.update({ where: { id }, data: { status: 'REJECTED' } });
    return c.json({ data: updated });
  },

  async cancel(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const lr = await prisma.leaveRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!lr) return c.json(new NotFoundError('İzin Talebi', id).toJSON(), 404);
    if (!['PENDING', 'APPROVED'].includes(lr.status)) return c.json(new ValidationError('Bu talep iptal edilemez.').toJSON(), 400);

    const updated = await prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    return c.json({ data: updated });
  },
};
