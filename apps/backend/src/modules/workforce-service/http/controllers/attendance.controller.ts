import { Context } from "hono";
import { NotFoundError, ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { requireParam, requireTenantId } from "../../../../utils/context.js";
import { getPaginationParams } from "../../../../utils/pagination.js";
import { getValidatedBody } from "../../../../middleware/validateBody.js";
import { attendanceCheckInBodySchema, attendanceCheckOutBodySchema, updateAttendanceBodySchema, type AttendanceCheckInBody, type AttendanceCheckOutBody, type UpdateAttendanceBody } from "../../../../schemas/request-body.schemas.js";

function day(value?: string): Date {
  const source = value ?? new Date().toISOString().slice(0, 10);
  return new Date(`${source}T00:00:00.000Z`);
}

function validateListQuery(c: Context): void {
  const page = c.req.query("page"), limit = c.req.query("limit"), from = c.req.query("dateFrom"), to = c.req.query("dateTo");
  if (page !== undefined && (!/^\d+$/.test(page) || Number(page) < 1)) throw new ValidationError("page pozitif bir tam sayi olmalidir.");
  if (limit !== undefined && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) throw new ValidationError("limit 1 ile 100 arasinda olmalidir.");
  for (const value of [from, to]) if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("Tarih YYYY-MM-DD formatinda olmalidir.");
  if (from && to && to < from) throw new ValidationError("Bitis tarihi baslangictan once olamaz.");
}

// ─────────────────────────────────────────────
// Attendance Controller — Puantaj / Giriş-Çıkış
// ─────────────────────────────────────────────

export const AttendanceController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    validateListQuery(c);

    const { page, limit, skip } = getPaginationParams(c, 50);
    const employeeId = c.req.query("employeeId");
    const dateFrom = c.req.query("dateFrom");
    const dateTo = c.req.query("dateTo");

    const where = {
      tenantId,
      ...(employeeId && { employeeId }),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }
        : {}),
    };

    const [total, data] = await prisma.$transaction([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
        },
        orderBy: { date: "desc" },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({
      data,
      meta: {
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  },

  async checkIn(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody<AttendanceCheckInBody>(c, attendanceCheckInBodySchema);

    const employee = await prisma.employee.findFirst({
      where: { id: body.employeeId, tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!employee) {
      return c.json(
        new ValidationError("Personel bulunamadi veya aktif degil.").toJSON(),
        400,
      );
    }

    const dateOnly = day(body.date);

    const attendance = await prisma.attendance.upsert({
      where: {
        employeeId_date: { employeeId: body.employeeId, date: dateOnly },
      },
      create: {
        tenantId,
        employeeId: body.employeeId,
        date: dateOnly,
        checkIn: body.checkIn ? new Date(body.checkIn) : new Date(),
        notes: body.notes ?? null,
      },
      update: {},
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return c.json({ data: attendance });
  },

  async checkOut(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody<AttendanceCheckOutBody>(c, attendanceCheckOutBodySchema);
    const dateOnly = day(body.date);

    const existing = await prisma.attendance.findFirst({
      where: { tenantId, employeeId: body.employeeId, date: dateOnly },
    });
    if (!existing)
      return c.json(
        new ValidationError("Önce giriş kaydı oluşturulmalıdır.").toJSON(),
        400,
      );
    const checkOut = body.checkOut ? new Date(body.checkOut) : new Date();
    if (existing.checkIn && checkOut < existing.checkIn) return c.json(new ValidationError("Cikis saati giris saatinden once olamaz.").toJSON(), 400);

    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOut,
        ...(body.overtimeHours !== undefined && {
          overtimeHours: body.overtimeHours,
        }),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return c.json({ data: updated });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const existing = await prisma.attendance.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      return c.json(new NotFoundError("Puantaj", id).toJSON(), 404);

    const body = getValidatedBody<UpdateAttendanceBody>(c, updateAttendanceBodySchema);
    const nextIn = body.checkIn === undefined ? existing.checkIn : body.checkIn ? new Date(body.checkIn) : null;
    const nextOut = body.checkOut === undefined ? existing.checkOut : body.checkOut ? new Date(body.checkOut) : null;
    if (nextIn && nextOut && nextOut < nextIn) return c.json(new ValidationError("Cikis saati giris saatinden once olamaz.").toJSON(), 400);
    const updated = await prisma.attendance.update({
      where: { id },
      data: {
        ...(body.checkIn !== undefined && {
          checkIn: body.checkIn ? new Date(body.checkIn) : null,
        }),
        ...(body.checkOut !== undefined && {
          checkOut: body.checkOut ? new Date(body.checkOut) : null,
        }),
        ...(body.overtimeHours !== undefined && {
          overtimeHours: body.overtimeHours,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const existing = await prisma.attendance.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      return c.json(new NotFoundError("Puantaj", id).toJSON(), 404);

    await prisma.attendance.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};
