import { Context } from "hono";
import { NotFoundError, ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { requireParam, requireTenantId } from "../../../../utils/context.js";
import { getPaginationParams } from "../../../../utils/pagination.js";

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${field} zorunludur.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new ValidationError(`${field} en fazla ${max} karakter olabilir.`);
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError(`${field} metin olmalidir.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new ValidationError(`${field} en fazla ${max} karakter olabilir.`);
  return normalized || null;
}

function optionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${field} gecersiz tarihtir.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError(`${field} gecersiz tarihtir.`);
  return parsed;
}

function validateDateOrder(purchaseDate: Date | null | undefined, warrantyEnd: Date | null | undefined): void {
  if (purchaseDate && warrantyEnd && warrantyEnd < purchaseDate) throw new ValidationError("warrantyEnd purchaseDate tarihinden once olamaz.");
}

// ─────────────────────────────────────────────
// Customer Asset Controller — Müşteri varlıkları CRUD
// ─────────────────────────────────────────────

export const CustomerAssetController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const contactId = c.req.query("contactId");

    const where = {
      tenantId,
      deletedAt: null,
      ...(contactId && { contactId }),
    };

    const [total, data] = await prisma.$transaction([
      prisma.customerAsset.count({ where }),
      prisma.customerAsset.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, code: true } },
          _count: { select: { serviceRequests: true } },
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

    const asset = await prisma.customerAsset.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            code: true,
            phone: true,
            email: true,
          },
        },
        serviceRequests: {
          where: { deletedAt: null },
          select: {
            id: true,
            number: true,
            subject: true,
            status: true,
            priority: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    if (!asset)
      return c.json(new NotFoundError("Müşteri Varlığı", id).toJSON(), 404);
    return c.json({ data: asset });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      contactId: string;
      name: string;
      brand?: string;
      model?: string;
      serialNo?: string;
      purchaseDate?: string;
      warrantyEnd?: string;
      notes?: string;
    }>();
    const contactId = requiredText(body?.contactId, "contactId", 100);
    const name = requiredText(body?.name, "name", 200);
    const brand = optionalText(body?.brand, "brand", 100);
    const model = optionalText(body?.model, "model", 100);
    const serialNo = optionalText(body?.serialNo, "serialNo", 100);
    const notes = optionalText(body?.notes, "notes", 5000);
    const purchaseDate = optionalDate(body?.purchaseDate, "purchaseDate");
    const warrantyEnd = optionalDate(body?.warrantyEnd, "warrantyEnd");
    validateDateOrder(purchaseDate, warrantyEnd);

    const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId, deletedAt: null }, select: { id: true } });
    if (!contact) return c.json(new NotFoundError("Cari", contactId).toJSON(), 404);

    const asset = await prisma.customerAsset.create({
      data: {
        tenantId,
        contactId,
        name,
        brand: brand ?? null,
        model: model ?? null,
        serialNo: serialNo ?? null,
        notes: notes ?? null,
        purchaseDate: purchaseDate ?? null,
        warrantyEnd: warrantyEnd ?? null,
      },
      include: { contact: { select: { id: true, name: true } } },
    });
    return c.json({ data: asset }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const existing = await prisma.customerAsset.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing)
      return c.json(new NotFoundError("Müşteri Varlığı", id).toJSON(), 404);

    const body = await c.req.json<{
      name?: string;
      brand?: string;
      model?: string;
      serialNo?: string;
      purchaseDate?: string;
      warrantyEnd?: string;
      notes?: string;
      isActive?: boolean;
    }>();

    const name = body.name === undefined ? undefined : requiredText(body.name, "name", 200);
    const brand = optionalText(body.brand, "brand", 100);
    const model = optionalText(body.model, "model", 100);
    const serialNo = optionalText(body.serialNo, "serialNo", 100);
    const notes = optionalText(body.notes, "notes", 5000);
    const purchaseDate = optionalDate(body.purchaseDate, "purchaseDate");
    const warrantyEnd = optionalDate(body.warrantyEnd, "warrantyEnd");
    if (body.isActive !== undefined && typeof body.isActive !== "boolean") throw new ValidationError("isActive boolean olmalidir.");
    validateDateOrder(purchaseDate === undefined ? existing.purchaseDate : purchaseDate, warrantyEnd === undefined ? existing.warrantyEnd : warrantyEnd);

    const result = await prisma.customerAsset.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...(name !== undefined && { name }),
        ...(brand !== undefined && { brand }),
        ...(model !== undefined && { model }),
        ...(serialNo !== undefined && { serialNo }),
        ...(notes !== undefined && { notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.purchaseDate !== undefined && {
          purchaseDate,
        }),
        ...(body.warrantyEnd !== undefined && {
          warrantyEnd,
        }),
      },
    });
    if (result.count === 0)
      return c.json(new NotFoundError("Müşteri Varlığı", id).toJSON(), 404);
    const updated = await prisma.customerAsset.findUniqueOrThrow({ where: { id } });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const result = await prisma.customerAsset.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0)
      return c.json(new NotFoundError("Müşteri Varlığı", id).toJSON(), 404);
    return c.json({ data: { success: true } });
  },
};
