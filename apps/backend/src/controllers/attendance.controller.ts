import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// Attendance Controller — Puantaj / Giriş-Çıkış
// ─────────────────────────────────────────────

export const AttendanceController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 50);
    const employeeId = c.req.query('employeeId');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');

    const where = {
      tenantId,
      ...(employeeId && { employeeId }),
      ...(dateFrom || dateTo ? {
        date: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      } : {}),
    };

    const [total, data] = await prisma.$transaction([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, department: true } },
        },
        orderBy: { date: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async checkIn(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ employeeId: string; date?: string; checkIn?: string; notes?: string }>();
    if (!body.employeeId) return c.json(new ValidationError('employeeId zorunludur.').toJSON(), 400);

    const date = body.date ? new Date(body.date) : new Date();
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const attendance = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: body.employeeId, date: dateOnly } },
      create: {
        tenantId, employeeId: body.employeeId, date: dateOnly,
        checkIn: body.checkIn ? new Date(body.checkIn) : new Date(),
        notes: body.notes ?? null,
      },
      update: {
        checkIn: body.checkIn ? new Date(body.checkIn) : new Date(),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return c.json({ data: attendance });
  },

  async checkOut(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ employeeId: string; date?: string; checkOut?: string; overtimeHours?: number }>();
    if (!body.employeeId) return c.json(new ValidationError('employeeId zorunludur.').toJSON(), 400);

    const date = body.date ? new Date(body.date) : new Date();
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: body.employeeId, date: dateOnly } },
    });
    if (!existing) return c.json(new ValidationError('Önce giriş kaydı oluşturulmalıdır.').toJSON(), 400);

    const updated = await prisma.attendance.update({
      where: { employeeId_date: { employeeId: body.employeeId, date: dateOnly } },
      data: {
        checkOut: body.checkOut ? new Date(body.checkOut) : new Date(),
        ...(body.overtimeHours !== undefined && { overtimeHours: body.overtimeHours }),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return c.json({ data: updated });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.attendance.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Puantaj', id).toJSON(), 404);

    const body = await c.req.json<{ checkIn?: string; checkOut?: string; overtimeHours?: number; notes?: string }>();
    const updated = await prisma.attendance.update({
      where: { id },
      data: {
        ...(body.checkIn !== undefined && { checkIn: body.checkIn ? new Date(body.checkIn) : null }),
        ...(body.checkOut !== undefined && { checkOut: body.checkOut ? new Date(body.checkOut) : null }),
        ...(body.overtimeHours !== undefined && { overtimeHours: body.overtimeHours }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.attendance.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Puantaj', id).toJSON(), 404);

    await prisma.attendance.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};
