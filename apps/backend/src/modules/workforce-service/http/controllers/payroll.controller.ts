import { AuditAction, EntityType } from "@prisma/client";
import { Context } from "hono";
import { NotFoundError, ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import {
  createPayrollAccountingVoucher,
  generateBankPaymentFile,
  readRequiredReason,
  reversePayroll,
  runPeriodClosingChecks,
} from "../../../../services/financial/index.js";
import { createAuditLog, getRequestMeta } from "../../../../utils/audit.js";
import { requireParam, requireTenantId } from "../../../../utils/context.js";
import { getPaginationParams } from "../../../../utils/pagination.js";
import { workforceApplication } from "../../composition.js";
import { getValidatedBody } from "../../../../middleware/validateBody.js";
import { bulkPayrollBodySchema, createPayrollBodySchema, payrollItemBodySchema, type CreatePayrollBody, type PayrollItemBody } from "../../../../schemas/request-body.schemas.js";

// ─────────────────────────────────────────────
// Payroll Controller — Bordro CRUD + toplu oluşturma
// ─────────────────────────────────────────────

export const PayrollController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit } = getPaginationParams(c, 20);
    const period = c.req.query("period");
    const employeeId = c.req.query("employeeId");
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new ValidationError("Gecersiz bordro donemi.");
    if (c.req.query("page") && (!/^\d+$/.test(c.req.query("page")!) || Number(c.req.query("page")) < 1)) throw new ValidationError("page pozitif tam sayi olmalidir.");
    if (c.req.query("limit") && (!/^\d+$/.test(c.req.query("limit")!) || Number(c.req.query("limit")) < 1 || Number(c.req.query("limit")) > 100)) throw new ValidationError("limit 1-100 arasinda olmalidir.");

    return c.json(
      await workforceApplication.payrollQueries.list(
        tenantId,
        { period, employeeId },
        { page, pageSize: limit },
      ),
    );
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const payroll = await workforceApplication.payrollQueries.getById(
      tenantId,
      id,
    );
    return c.json({ data: payroll });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody<CreatePayrollBody>(c, createPayrollBodySchema);

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

    // Aynı dönem + personel kontrolü
    const exists = await prisma.payroll.findUnique({
      where: {
        tenantId_employeeId_period: {
          tenantId,
          employeeId: body.employeeId,
          period: body.period,
        },
      },
    });
    if (exists && !exists.deletedAt) {
      return c.json(
        new ValidationError(
          "Bu personel için bu dönemde zaten bordro mevcut.",
        ).toJSON(),
        400,
      );
    }

    // Kesintileri hesapla
    const deductions = (body.items ?? [])
      .filter((i) => i.isDeduction)
      .reduce((sum, i) => sum + i.amount, 0);
    const additions = (body.items ?? [])
      .filter((i) => !i.isDeduction)
      .reduce((sum, i) => sum + i.amount, 0);
    const netSalary = body.grossSalary + additions - deductions;
    if (netSalary < 0) throw new ValidationError("Net maas negatif olamaz.");

    const payroll = await prisma.$transaction(async (tx) => {
      const created = exists ? await tx.payroll.update({
        where: { id: exists.id }, data: { deletedAt: null, paidAt: null, grossSalary: body.grossSalary, deductions, netSalary, notes: body.notes ?? null },
      }) : await tx.payroll.create({ data: {
          tenantId,
          employeeId: body.employeeId,
          period: body.period,
          grossSalary: body.grossSalary,
          deductions,
          netSalary,
          notes: body.notes ?? null,
        } });
      if (exists) await tx.payrollItem.deleteMany({ where: { tenantId, payrollId: created.id } });
      if (body.items?.length) {
        await tx.payrollItem.createMany({
          data: body.items.map((item) => ({
            tenantId,
            payrollId: created.id,
            label: item.label,
            amount: item.amount,
            isDeduction: item.isDeduction,
          })),
        });
      }
      return tx.payroll.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          items: true,
        },
      });
    });
    return c.json({ data: payroll }, 201);
  },

  async generateBulk(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody<{ period: string }>(c, bulkPayrollBodySchema);

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
      return c.json({
        data: {
          created: 0,
          message: "Tüm personeller için bu dönemde bordro zaten mevcut.",
        },
      });
    }

    const created = await prisma.$transaction(
      toCreate.map((emp) =>
        prisma.payroll.create({
          data: {
            tenantId,
            employeeId: emp.id,
            period: body.period,
            grossSalary: emp.salary,
            deductions: 0,
            netSalary: emp.salary,
          },
        }),
      ),
    );

    return c.json(
      {
        data: {
          created: created.length,
          message: `${created.length} bordro oluşturuldu.`,
        },
      },
      201,
    );
  },

  async addItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const payrollId = requireParam(c, "id");

    const payroll = await prisma.payroll.findFirst({
      where: { id: payrollId, tenantId, deletedAt: null },
    });
    if (!payroll)
      return c.json(new NotFoundError("Bordro", payrollId).toJSON(), 404);
    if (payroll.paidAt)
      return c.json(
        new ValidationError("Ödenmiş bordroya kalem eklenemez.").toJSON(),
        400,
      );

    const body = getValidatedBody<PayrollItemBody>(c, payrollItemBodySchema);

    const item = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`payroll:${payrollId}`}))`;
      const current = await tx.payroll.findFirst({ where: { id: payrollId, tenantId, deletedAt: null } });
      if (!current) throw new NotFoundError("Bordro", payrollId);
      if (current.paidAt) throw new ValidationError("Ödenmiş bordroya kalem eklenemez.");
      const created = await tx.payrollItem.create({ data: { tenantId, payrollId, label: body.label, amount: body.amount, isDeduction: body.isDeduction } });
      const allItems = await tx.payrollItem.findMany({ where: { tenantId, payrollId } });
      const deductions = allItems.filter((i) => i.isDeduction).reduce((sum, i) => sum + Number(i.amount), 0);
      const additions = allItems.filter((i) => !i.isDeduction).reduce((sum, i) => sum + Number(i.amount), 0);
      const netSalary = Number(current.grossSalary) + additions - deductions;
      if (netSalary < 0) throw new ValidationError("Net maaş negatif olamaz.");
      await tx.payroll.update({ where: { id: payrollId }, data: { deductions, netSalary } });
      return created;
    });

    return c.json({ data: item }, 201);
  },

  async removeItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const itemId = requireParam(c, "itemId");

    const item = await prisma.payrollItem.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item)
      return c.json(new NotFoundError("Bordro Kalemi", itemId).toJSON(), 404);

    const payroll = await prisma.payroll.findFirst({
      where: { id: item.payrollId, tenantId, deletedAt: null },
    });
    if (payroll?.paidAt)
      return c.json(
        new ValidationError("Ödenmiş bordrodan kalem silinemez.").toJSON(),
        400,
      );

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`payroll:${item.payrollId}`}))`;
      const current = await tx.payroll.findFirst({ where: { id: item.payrollId, tenantId, deletedAt: null } });
      if (!current) throw new NotFoundError("Bordro", item.payrollId);
      if (current.paidAt) throw new ValidationError("Ödenmiş bordrodan kalem silinemez.");
      await tx.payrollItem.delete({ where: { id: itemId } });
      const allItems = await tx.payrollItem.findMany({ where: { tenantId, payrollId: current.id } });
      const deductions = allItems
        .filter((i) => i.isDeduction)
        .reduce((sum, i) => sum + Number(i.amount), 0);
      const additions = allItems
        .filter((i) => !i.isDeduction)
        .reduce((sum, i) => sum + Number(i.amount), 0);
      await tx.payroll.update({
        where: { id: current.id },
        data: {
          deductions,
          netSalary: Number(current.grossSalary) + additions - deductions,
        },
      });
    });

    return c.json({ data: { success: true } });
  },

  async markPaid(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const payroll = await prisma.payroll.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!payroll) return c.json(new NotFoundError("Bordro", id).toJSON(), 404);
    if (payroll.paidAt)
      return c.json(new ValidationError("Bordro zaten ödenmiş.").toJSON(), 400);

    const result = await prisma.payroll.updateMany({ where: { id, tenantId, deletedAt: null, paidAt: null }, data: { paidAt: new Date() } });
    if (result.count === 0) return c.json(new ValidationError("Bordro zaten ödenmiş.").toJSON(), 400);
    const updated = await prisma.payroll.findUniqueOrThrow({ where: { id } });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const payroll = await prisma.payroll.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!payroll) return c.json(new NotFoundError("Bordro", id).toJSON(), 404);
    if (payroll.paidAt)
      return c.json(
        new ValidationError("Ödenmiş bordro silinemez.").toJSON(),
        400,
      );

    await prisma.payroll.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return c.json({ data: { success: true } });
  },

  async reversePayroll(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get("userId") as string | undefined;
    const id = requireParam(c, "id");
    const { ipAddress, userAgent } = getRequestMeta(c);

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      throw new ValidationError("Geçersiz JSON gövdesi.");
    }

    const reason = readRequiredReason(body);

    await reversePayroll(prisma, {
      tenantId,
      userId,
      payrollId: id,
      reason,
      auditMeta: { ipAddress, userAgent },
    });

    return c.json({ data: { success: true } });
  },

  async getBankFile(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get("userId") as string | undefined;
    const period = c.req.query("period");
    if (!period) throw new ValidationError("period parametresi zorunludur.");

    const result = await generateBankPaymentFile(prisma, tenantId, period);
    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: "payroll",
      entityType: EntityType.OTHER,
      entityId: period,
      action: AuditAction.EXPORT,
      newValues: {
        period,
        filename: result.filename,
        exportType: "bank_payment_file",
      },
      ipAddress,
      userAgent,
    });

    c.header("Content-Type", result.mimeType);
    c.header(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    return c.body(result.content);
  },

  async postAccountingVoucher(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get("userId") as string | undefined;

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      throw new ValidationError("Geçersiz JSON gövdesi.");
    }

    const period = body.period;
    if (typeof period !== "string" || !period) {
      throw new ValidationError("period alanı zorunludur.");
    }

    const result = await createPayrollAccountingVoucher(
      prisma,
      tenantId,
      period,
      userId,
    );
    return c.json({ data: result }, 201);
  },

  async getClosingChecks(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const period = c.req.query("period");
    if (!period) throw new ValidationError("period parametresi zorunludur.");

    const result = await runPeriodClosingChecks(prisma, tenantId, period);
    return c.json({ data: result });
  },
};
