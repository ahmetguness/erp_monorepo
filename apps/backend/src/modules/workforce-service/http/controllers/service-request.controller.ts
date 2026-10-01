import {
  AuditAction,
  EntityType,
  Priority,
  ServiceActivityType,
  ServiceStatus,
} from "@prisma/client";
import { Context } from "hono";
import { NotFoundError, ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { ServiceAutomationService } from "../../../../services/service-automation.service.js";
import { createAuditLog, getRequestMeta } from "../../../../utils/audit.js";
import {
  requireParam,
  requireTenantId,
  requireUserId,
} from "../../../../utils/context.js";
import { generateDocumentNumber } from "../../../../utils/generate-number.js";
import { getPaginationParams } from "../../../../utils/pagination.js";
import { calculateServiceRequestSla } from "../../domain/index.js";

const serviceAutomation = new ServiceAutomationService(prisma);

export const calculateSla = calculateServiceRequestSla;

const PRIORITIES = new Set(Object.values(Priority));
const ACTIVITY_TYPES = new Set(Object.values(ServiceActivityType));
function text(
  value: unknown,
  field: string,
  max: number,
  required = false,
): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} zorunludur.`);
    return undefined;
  }
  if (typeof value !== "string")
    throw new ValidationError(`${field} metin olmalidir.`);
  const result = value.trim();
  if (required && !result) throw new ValidationError(`${field} zorunludur.`);
  if (result.length > max)
    throw new ValidationError(`${field} en fazla ${max} karakter olabilir.`);
  return result || undefined;
}

// ─────────────────────────────────────────────
// Service Request Controller
// ─────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const ServiceRequestController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query("status") as ServiceStatus | undefined;
    const priority = c.req.query("priority") as Priority | undefined;
    const assignedToId = c.req.query("assignedToId");
    if (status && !Object.values(ServiceStatus).includes(status))
      throw new ValidationError("Gecersiz status.");
    if (priority && !PRIORITIES.has(priority))
      throw new ValidationError("Gecersiz priority.");
    if (assignedToId && assignedToId.length > 100)
      throw new ValidationError("assignedToId en fazla 100 karakter olabilir.");

    const where = {
      tenantId,
      deletedAt: null,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assignedToId && { assignedToId }),
    };

    const [total, data] = await prisma.$transaction([
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, code: true } },
          customerAsset: {
            select: {
              id: true,
              name: true,
              brand: true,
              model: true,
              serialNo: true,
            },
          },
          _count: { select: { items: true, activities: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: skip,
        take: limit,
      }),
    ]);

    const dataWithSla = data.map((row) => ({
      ...row,
      sla: calculateSla(row.createdAt, row.priority, row.status, row.closedAt),
    }));

    return c.json({
      data: dataWithSla,
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

    const sr = await prisma.serviceRequest.findFirst({
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
        customerAsset: {
          select: {
            id: true,
            name: true,
            brand: true,
            model: true,
            serialNo: true,
            warrantyEnd: true,
          },
        },
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
        history: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!sr)
      return c.json(new NotFoundError("Servis Talebi", id).toJSON(), 404);
    const srWithSla = {
      ...sr,
      sla: calculateSla(sr.createdAt, sr.priority, sr.status, sr.closedAt),
    };
    return c.json({ data: srWithSla });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      contactId?: string;
      customerAssetId?: string;
      subject: string;
      description?: string;
      priority?: Priority;
      assignedToId?: string;
    }>();
    const subject = text(body.subject, "subject", 200, true)!;
    const description = text(body.description, "description", 5000);
    if (body.priority && !PRIORITIES.has(body.priority))
      throw new ValidationError("Gecersiz priority.");
    const contact = body.contactId
      ? await prisma.contact.findFirst({
          where: { id: body.contactId, tenantId, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (body.contactId && !contact)
      throw new NotFoundError("Cari", body.contactId);
    const number = await generateDocumentNumber(
      tenantId,
      "service_request",
      "SR-",
      "serviceRequest",
    );

    // Garanti bilgisini asset'ten al
    let warrantyEnd: Date | null = null;
    if (body.customerAssetId) {
      const asset = await prisma.customerAsset.findFirst({
        where: { id: body.customerAssetId, tenantId },
        select: { warrantyEnd: true, contactId: true },
      });
      if (!asset)
        throw new NotFoundError("Musteri Varligi", body.customerAssetId);
      if (body.contactId && asset.contactId !== body.contactId)
        throw new ValidationError("Varlik secilen musteriyle eslesmiyor.");
      warrantyEnd = asset.warrantyEnd;
    }

    const sr = await prisma.serviceRequest.create({
      data: {
        tenantId,
        number,
        subject,
        description: description ?? null,
        contactId: body.contactId ?? null,
        customerAssetId: body.customerAssetId ?? null,
        priority: body.priority ?? "MEDIUM",
        assignedToId: body.assignedToId ?? null,
        warrantyEnd,
        history: { create: { tenantId, toStatus: "OPEN" } },
      },
      include: { contact: { select: { id: true, name: true } } },
    });
    return c.json({ data: sr }, 201);
  },

  async changeStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const sr = await prisma.serviceRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!sr)
      return c.json(new NotFoundError("Servis Talebi", id).toJSON(), 404);

    const body = await c.req.json<{ status: ServiceStatus; notes?: string }>();
    if (!body.status)
      return c.json(new ValidationError("status zorunludur.").toJSON(), 400);

    const allowed = STATUS_TRANSITIONS[sr.status];
    if (!allowed.includes(body.status)) {
      return c.json(
        new ValidationError(
          `${sr.status} → ${body.status} geçişi yapılamaz.`,
        ).toJSON(),
        400,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${id}))`;
      const current = await tx.serviceRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!current) throw new NotFoundError("Servis Talebi", id);
      if (!STATUS_TRANSITIONS[current.status].includes(body.status)) throw new ValidationError(`${current.status} -> ${body.status} gecisi yapilamaz.`);
      const result = await tx.serviceRequest.update({
        where: { id },
        data: {
          status: body.status,
          closedAt: ["COMPLETED", "CANCELLED"].includes(body.status)
            ? new Date()
            : null,
        },
      });
      await tx.serviceRequestHistory.create({
        data: {
          tenantId,
          serviceRequestId: id,
          fromStatus: current.status,
          toStatus: body.status,
          notes: body.notes ?? null,
        },
      });
      await tx.serviceActivity.create({
        data: {
          tenantId,
          serviceRequestId: id,
          activityType: "STATUS_CHANGE",
          notes: `${sr.status} → ${body.status}${body.notes ? ": " + body.notes : ""}`,
        },
      });
      return result;
    });

    return c.json({ data: updated });
  },

  async assign(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const sr = await prisma.serviceRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!sr)
      return c.json(new NotFoundError("Servis Talebi", id).toJSON(), 404);

    const body = await c.req.json<{ assignedToId: string | null }>();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.serviceRequest.update({
        where: { id },
        data: { assignedToId: body.assignedToId },
      });
      await tx.serviceActivity.create({
        data: {
          tenantId,
          serviceRequestId: id,
          activityType: "ASSIGNMENT",
          notes: body.assignedToId
            ? `Atandı: ${body.assignedToId}`
            : "Atama kaldırıldı",
        },
      });
      return result;
    });
    return c.json({ data: updated });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const existing = await prisma.serviceRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing)
      return c.json(new NotFoundError("Servis Talebi", id).toJSON(), 404);

    const body = await c.req.json<{
      subject?: string;
      description?: string;
      priority?: Priority;
    }>();
    if (body.subject !== undefined)
      body.subject = text(body.subject, "subject", 200, true);
    if (body.description !== undefined)
      body.description = text(body.description, "description", 5000) ?? "";
    if (body.priority !== undefined && !PRIORITIES.has(body.priority))
      throw new ValidationError("Gecersiz priority.");
    const updated = await prisma.serviceRequest.update({
      where: { id },
      data: {
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.description !== undefined && {
          description: body.description,
        }),
        ...(body.priority !== undefined && { priority: body.priority }),
      },
    });
    return c.json({ data: updated });
  },

  // ─── Items ──────────────────────────────────

  async addItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const srId = requireParam(c, "id");

    const sr = await prisma.serviceRequest.findFirst({
      where: { id: srId, tenantId, deletedAt: null },
    });
    if (!sr)
      return c.json(new NotFoundError("Servis Talebi", srId).toJSON(), 404);

    const body = await c.req.json<{
      description: string;
      productId?: string;
      quantity?: number;
      unitPrice?: number;
    }>();
    const description = text(body.description, "description", 500, true)!;

    const qty = body.quantity ?? 1;
    const price = body.unitPrice ?? 0;
    if (
      !Number.isFinite(qty) ||
      qty <= 0 ||
      qty > 999999999 ||
      Math.round(qty * 1000) !== qty * 1000
    )
      throw new ValidationError(
        "quantity pozitif ve en fazla 3 ondalik olmalidir.",
      );
    if (
      !Number.isFinite(price) ||
      price < 0 ||
      price > 999999999 ||
      Math.round(price * 100) !== price * 100
    )
      throw new ValidationError(
        "unitPrice negatif olamaz ve en fazla 2 ondalik olmalidir.",
      );
    if (body.productId) {
      const product = await prisma.product.findFirst({
        where: { id: body.productId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!product) throw new NotFoundError("Urun", body.productId);
    }

    const item = await prisma.serviceRequestItem.create({
      data: {
        tenantId,
        serviceRequestId: srId,
        description,
        productId: body.productId ?? null,
        quantity: qty,
        unitPrice: price,
        lineTotal: qty * price,
      },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    return c.json({ data: item }, 201);
  },

  async removeItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const itemId = requireParam(c, "itemId");

    const srId = requireParam(c, "id");
    const item = await prisma.serviceRequestItem.findFirst({
      where: { id: itemId, tenantId, serviceRequestId: srId },
    });
    if (!item)
      return c.json(new NotFoundError("Servis Kalemi", itemId).toJSON(), 404);

    await prisma.serviceRequestItem.delete({ where: { id: itemId } });
    return c.json({ data: { success: true } });
  },

  // ─── Activities ─────────────────────────────

  async addActivity(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const srId = requireParam(c, "id");

    const sr = await prisma.serviceRequest.findFirst({
      where: { id: srId, tenantId, deletedAt: null },
    });
    if (!sr)
      return c.json(new NotFoundError("Servis Talebi", srId).toJSON(), 404);

    const body = await c.req.json<{
      activityType: ServiceActivityType;
      notes?: string;
    }>();
    if (!body.activityType)
      return c.json(
        new ValidationError("activityType zorunludur.").toJSON(),
        400,
      );
    if (!ACTIVITY_TYPES.has(body.activityType))
      throw new ValidationError("Gecersiz activityType.");
    const notes = text(body.notes, "notes", 2000);

    const activity = await prisma.serviceActivity.create({
      data: {
        tenantId,
        serviceRequestId: srId,
        activityType: body.activityType,
        notes: notes ?? null,
      },
    });
    return c.json({ data: activity }, 201);
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");

    const sr = await prisma.serviceRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!sr)
      return c.json(new NotFoundError("Servis Talebi", id).toJSON(), 404);

    await prisma.serviceRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return c.json({ data: { success: true } });
  },

  async checkSlaBreaches(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const activeRequests = await prisma.serviceRequest.findMany({
      where: {
        tenantId,
        status: {
          in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "WAITING_CUSTOMER"],
        },
        deletedAt: null,
      },
      select: {
        id: true,
        number: true,
        priority: true,
        status: true,
        subject: true,
        createdAt: true,
        closedAt: true,
      },
    });

    const breached: string[] = [];
    for (const request of activeRequests) {
      const sla = calculateSla(
        request.createdAt,
        request.priority,
        request.status,
        request.closedAt,
      );
      if (sla.isBreached) {
        breached.push(`${request.number} (${request.subject})`);
      }
    }

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: "service",
      entityType: EntityType.OTHER,
      entityId: "sla_sweep",
      action: AuditAction.UPDATE,
      newValues: {
        checkedCount: activeRequests.length,
        breachedCount: breached.length,
        breachedTickets: breached,
      },
      ipAddress,
      userAgent,
    });

    return c.json({
      data: {
        checked: activeRequests.length,
        breachedCount: breached.length,
        breached,
      },
    });
  },

  // ── Service Automation Uç Noktaları ──

  async assignTechnician(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");
    const body = await c.req.json<{ technicianId: string }>();

    if (!body.technicianId) {
      return c.json(
        new ValidationError("technicianId alanı zorunludur.").toJSON(),
        400,
      );
    }

    const result = await serviceAutomation.assignTechnician(
      tenantId,
      id,
      body.technicianId,
    );
    return c.json({ data: result });
  },

  async reserveParts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");
    const body = await c.req.json<{ warehouseId: string }>();

    if (!body.warehouseId) {
      return c.json(
        new ValidationError("warehouseId alanı zorunludur.").toJSON(),
        400,
      );
    }

    const result = await serviceAutomation.reserveServiceParts(
      tenantId,
      id,
      body.warehouseId,
    );
    return c.json({ data: result });
  },

  async completeAndInvoice(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, "id");
    const body = await c.req
      .json<{ warehouseId?: string }>()
      .catch(() => ({ warehouseId: undefined }));

    const result = await serviceAutomation.completeServiceAndGenerateInvoice(
      tenantId,
      id,
      body.warehouseId,
    );
    return c.json({ data: result });
  },
};
