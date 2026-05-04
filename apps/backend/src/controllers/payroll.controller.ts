import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// Payroll Controller — Bordro CRUD + toplu oluşturma
// ─────────────────────────────────────────────

export const PayrollController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const period = c.req.query('period');
    const employeeId = c.req.query('employeeId');

    const where = {
      tenantId, deletedAt: null,
      ...(period && { period }),
      ...(employeeId && { employeeId }),
    };

    const [total, data] = await prisma.$transaction([
      prisma.payroll.count({ where }),
      prisma.payroll.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, department: true, position: true } },
          items: true,
        },
        orderBy: [{ period: 'desc' }, { employee: { lastName: 'asc' } }],
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const payroll = await prisma.payroll.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: true, position: true, salary: true } },
        items: { orderBy: { isDeduction: 'asc' } },
      },
    });
    if (!payroll) return c.json(new NotFoundError('Bordro', id).toJSON(), 404);
    return c.json({ data: payroll });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      employeeId: string; period: string; grossSalary: number;
      items?: Array<{ label: string; amount: number; isDeduction: boolean }>;
      notes?: string;
    }>();
    if (!body.employeeId || !body.period || body.grossSalary == null) {
      return c.json(new ValidationError('employeeId, period ve grossSalary zorunludur.').toJSON(), 400);
    }

    // Dönem formatı kontrolü (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(body.period)) {
      return c.json(new ValidationError('period formatı YYYY-MM olmalıdır (ör. 2026-03).').toJSON(), 400);
    }

    // Aynı dönem + personel kontrolü
    const exists = await prisma.payroll.findUnique({
      where: { tenantId_employeeId_period: { tenantId, employeeId: body.employeeId, period: body.period } },
    });
    if (exists && !exists.deletedAt) {
      return c.json(new ValidationError('Bu personel için bu dönemde zaten bordro mevcut.').toJSON(), 400);
    }

    // Kesintileri hesapla
    const deductions = (body.items ?? []).filter((i) => i.isDeduction).reduce((sum, i) => sum + i.amount, 0);
    const additions = (body.items ?? []).filter((i) => !i.isDeduction).reduce((sum, i) => sum + i.amount, 0);
    const netSalary = body.grossSalary + additions - deductions;

    const payroll = await prisma.payroll.create({
      data: {
        tenantId, employeeId: body.employeeId, period: body.period,
        grossSalary: body.grossSalary, deductions, netSalary,
        notes: body.notes ?? null,
        ...(body.items?.length && {
          items: {
            create: body.items.map((item) => ({
              tenantId, label: item.label, amount: item.amount, isDeduction: item.isDeduction,
            })),
          },
        }),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        items: true,
      },
    });
    return c.json({ data: payroll }, 201);
  },

  async generateBulk(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ period: string }>();
    if (!body.period || !/^\d{4}-\d{2}$/.test(body.period)) {
      return c.json(new ValidationError('period formatı YYYY-MM olmalıdır.').toJSON(), 400);
    }

    // Aktif personelleri al
    const employees = await prisma.employee.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, salary: true },
    });

    // Zaten bordrosu olanları filtrele
    const existingPayrolls = await prisma.payroll.findMany({
      where: { tenantId, period: body.period, deletedAt: null },
      select: { employeeId: true },
    });
    const existingIds = new Set(existingPayrolls.map((p) => p.employeeId));
    const toCreate = employees.filter((e) => !existingIds.has(e.id));

    if (toCreate.length === 0) {
      return c.json({ data: { created: 0, message: 'Tüm personeller için bu dönemde bordro zaten mevcut.' } });
    }

    const created = await prisma.$transaction(
      toCreate.map((emp) =>
        prisma.payroll.create({
          data: {
            tenantId, employeeId: emp.id, period: body.period,
            grossSalary: emp.salary, deductions: 0, netSalary: emp.salary,
          },
        }),
      ),
    );

    return c.json({ data: { created: created.length, message: `${created.length} bordro oluşturuldu.` } }, 201);
  },

  async addItem(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const payrollId = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const payroll = await prisma.payroll.findFirst({ where: { id: payrollId, tenantId, deletedAt: null } });
    if (!payroll) return c.json(new NotFoundError('Bordro', payrollId).toJSON(), 404);
    if (payroll.paidAt) return c.json(new ValidationError('Ödenmiş bordroya kalem eklenemez.').toJSON(), 400);

    const body = await c.req.json<{ label: string; amount: number; isDeduction: boolean }>();
    if (!body.label || body.amount == null) return c.json(new ValidationError('label ve amount zorunludur.').toJSON(), 400);

    const item = await prisma.payrollItem.create({
      data: { tenantId, payrollId, label: body.label, amount: body.amount, isDeduction: body.isDeduction ?? false },
    });

    // Net maaşı yeniden hesapla
    const allItems = await prisma.payrollItem.findMany({ where: { payrollId } });
    const deductions = allItems.filter((i) => i.isDeduction).reduce((sum, i) => sum + Number(i.amount), 0);
    const additions = allItems.filter((i) => !i.isDeduction).reduce((sum, i) => sum + Number(i.amount), 0);
    await prisma.payroll.update({
      where: { id: payrollId },
      data: { deductions, netSalary: Number(payroll.grossSalary) + additions - deductions },
    });

    return c.json({ data: item }, 201);
  },

  async removeItem(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const itemId = c.req.param('itemId')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const item = await prisma.payrollItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return c.json(new NotFoundError('Bordro Kalemi', itemId).toJSON(), 404);

    const payroll = await prisma.payroll.findFirst({ where: { id: item.payrollId, deletedAt: null } });
    if (payroll?.paidAt) return c.json(new ValidationError('Ödenmiş bordrodan kalem silinemez.').toJSON(), 400);

    await prisma.payrollItem.delete({ where: { id: itemId } });

    // Net maaşı yeniden hesapla
    if (payroll) {
      const allItems = await prisma.payrollItem.findMany({ where: { payrollId: payroll.id } });
      const deductions = allItems.filter((i) => i.isDeduction).reduce((sum, i) => sum + Number(i.amount), 0);
      const additions = allItems.filter((i) => !i.isDeduction).reduce((sum, i) => sum + Number(i.amount), 0);
      await prisma.payroll.update({
        where: { id: payroll.id },
        data: { deductions, netSalary: Number(payroll.grossSalary) + additions - deductions },
      });
    }

    return c.json({ data: { success: true } });
  },

  async markPaid(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const payroll = await prisma.payroll.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!payroll) return c.json(new NotFoundError('Bordro', id).toJSON(), 404);
    if (payroll.paidAt) return c.json(new ValidationError('Bordro zaten ödenmiş.').toJSON(), 400);

    const updated = await prisma.payroll.update({ where: { id }, data: { paidAt: new Date() } });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const payroll = await prisma.payroll.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!payroll) return c.json(new NotFoundError('Bordro', id).toJSON(), 404);
    if (payroll.paidAt) return c.json(new ValidationError('Ödenmiş bordro silinemez.').toJSON(), 400);

    await prisma.payroll.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.json({ data: { success: true } });
  },
};
