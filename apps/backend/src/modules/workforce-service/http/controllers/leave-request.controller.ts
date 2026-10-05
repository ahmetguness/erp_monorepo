import { LeaveStatus } from "@prisma/client";
import { Context } from "hono";
import { NotFoundError, ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { requireParam, requireTenantId, requireUserId } from "../../../../utils/context.js";
import { getPaginationParams } from "../../../../utils/pagination.js";
import { getValidatedBody } from "../../../../middleware/validateBody.js";
import { createLeaveRequestBodySchema, type CreateLeaveRequestBody } from "../../../../schemas/request-body.schemas.js";

function validateListQuery(c: Context): void {
  const page = c.req.query("page");
  const limit = c.req.query("limit");
  const status = c.req.query("status");
  if (page !== undefined && (!/^\d+$/.test(page) || Number(page) < 1)) throw new ValidationError("page pozitif bir tam sayi olmalidir.");
  if (limit !== undefined && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) throw new ValidationError("limit 1 ile 100 arasinda olmalidir.");
  if (status !== undefined && !Object.values(LeaveStatus).includes(status as LeaveStatus)) throw new ValidationError("Gecersiz izin durumu.");
}

// ─────────────────────────────────────────────
// Leave Request Controller — İzin talebi CRUD + onay
// ─────────────────────────────────────────────

export const LeaveRequestController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    validateListQuery(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query("status") as LeaveStatus | undefined;
    const employeeId = c.req.query("employeeId");

    const where = {
      tenantId,
      deletedAt: null,
      ...(status && { status }),
      ...(employeeId && { employeeId }),
    };

    const [total, data] = await prisma.$transaction([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: true,
              position: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
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

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const lr = await prisma.leaveRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true,
            position: true,
            email: true,
          },
        },
      },
    });
    if (!lr) return c.json(new NotFoundError("İzin Talebi", id).toJSON(), 404);
    return c.json({ data: lr });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody<CreateLeaveRequestBody>(c, createLeaveRequestBodySchema);

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

    const lr = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`leave:${body.employeeId}`}))`;
      const overlap = await tx.leaveRequest.findFirst({
        where: { employeeId: body.employeeId, tenantId, deletedAt: null, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: new Date(body.endDate) }, endDate: { gte: new Date(body.startDate) } },
      });
      if (overlap) throw new ValidationError("Bu tarih araliginda zaten bir izin talebi mevcut.");
      return tx.leaveRequest.create({
        data: { tenantId, employeeId: body.employeeId, type: body.type, startDate: new Date(body.startDate), endDate: new Date(body.endDate), days: body.days, notes: body.notes ?? null },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });
    });
    return c.json({ data: lr }, 201);
  },

  async approve(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, "id");

    const result = await prisma.leaveRequest.updateMany({ where: { id, tenantId, deletedAt: null, status: "PENDING" }, data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() } });
    if (result.count === 0) {
      const exists = await prisma.leaveRequest.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
      if (!exists) return c.json(new NotFoundError("İzin Talebi", id).toJSON(), 404);
      return c.json(
        new ValidationError("Sadece bekleyen talepler onaylanabilir.").toJSON(),
        400,
      );
    }
    const updated = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
    return c.json({ data: updated });
  },

  async reject(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const result = await prisma.leaveRequest.updateMany({ where: { id, tenantId, deletedAt: null, status: "PENDING" }, data: { status: "REJECTED" } });
    if (result.count === 0) {
      const exists = await prisma.leaveRequest.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
      if (!exists) return c.json(new NotFoundError("İzin Talebi", id).toJSON(), 404);
      return c.json(
        new ValidationError(
          "Sadece bekleyen talepler reddedilebilir.",
        ).toJSON(),
        400,
      );
    }
    const updated = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
    return c.json({ data: updated });
  },

  async cancel(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const result = await prisma.leaveRequest.updateMany({ where: { id, tenantId, deletedAt: null, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "CANCELLED" } });
    if (result.count === 0) {
      const exists = await prisma.leaveRequest.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
      if (!exists) return c.json(new NotFoundError("İzin Talebi", id).toJSON(), 404);
      return c.json(
        new ValidationError("Bu talep iptal edilemez.").toJSON(),
        400,
      );
    }
    const updated = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
    return c.json({ data: updated });
  },
};
