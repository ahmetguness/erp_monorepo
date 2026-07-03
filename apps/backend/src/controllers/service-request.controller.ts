import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { ServiceStatus, ServiceActivityType, Priority, AuditAction, EntityType } from '@prisma/client';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

export function calculateSla(
  createdAt: Date,
  priority: Priority,
  status: ServiceStatus,
  closedAt: Date | null
) {
  const limits: Record<Priority, number> = {
    CRITICAL: 2,
    HIGH: 4,
    MEDIUM: 24,
    LOW: 72,
  };
  const limitHours = limits[priority] || 24;
  const limitMs = limitHours * 60 * 60 * 1000;
  const targetDate = new Date(createdAt.getTime() + limitMs);
  const resolvedAt = closedAt || (['COMPLETED', 'CANCELLED'].includes(status) ? new Date() : null);
  const comparisonDate = resolvedAt || new Date();
  const isBreached = comparisonDate.getTime() > targetDate.getTime();
  const remainingMs = targetDate.getTime() - comparisonDate.getTime();
  const remainingMinutes = Math.round(remainingMs / (60 * 1000));

  return {
    limitHours,
    targetDate: targetDate.toISOString(),
    isBreached,
    remainingMinutes,
  };
}

// ─────────────────────────────────────────────
// Service Request Controller
// ─────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_PARTS', 'WAITING_CUSTOMER', 'COMPLETED', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const ServiceRequestController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query('status') as ServiceStatus | undefined;
    const priority = c.req.query('priority') as Priority | undefined;
    const assignedToId = c.req.query('assignedToId');

    const where = {
      tenantId, deletedAt: null,
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
          customerAsset: { select: { id: true, name: true, brand: true, model: true, serialNo: true } },
          _count: { select: { items: true, activities: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    const dataWithSla = data.map((row) => ({
      ...row,
      sla: calculateSla(row.createdAt, row.priority, row.status, row.closedAt),
    }));

    return c.json({ data: dataWithSla, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const sr = await prisma.serviceRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, code: true, phone: true, email: true } },
        customerAsset: { select: { id: true, name: true, brand: true, model: true, serialNo: true, warrantyEnd: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
        history: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!sr) return c.json(new NotFoundError('Servis Talebi', id).toJSON(), 404);
    const srWithSla = {
      ...sr,
      sla: calculateSla(sr.createdAt, sr.priority, sr.status, sr.closedAt),
    };
    return c.json({ data: srWithSla });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      contactId?: string; customerAssetId?: string; subject: string;
      description?: string; priority?: Priority; assignedToId?: string;
    }>();
    if (!body.subject) return c.json(new ValidationError('subject zorunludur.').toJSON(), 400);
    const number = await generateDocumentNumber(tenantId, 'service_request', 'SR-', 'serviceRequest');

    // Garanti bilgisini asset'ten al
    let warrantyEnd: Date | null = null;
    if (body.customerAssetId) {
      const asset = await prisma.customerAsset.findFirst({ where: { id: body.customerAssetId, tenantId }, select: { warrantyEnd: true } });
      warrantyEnd = asset?.warrantyEnd ?? null;
    }

    const sr = await prisma.serviceRequest.create({
      data: {
        tenantId, number, subject: body.subject,
        description: body.description ?? null,
        contactId: body.contactId ?? null,
        customerAssetId: body.customerAssetId ?? null,
        priority: body.priority ?? 'MEDIUM',
        assignedToId: body.assignedToId ?? null,
        warrantyEnd,
        history: { create: { tenantId, toStatus: 'OPEN' } },
      },
      include: { contact: { select: { id: true, name: true } } },
    });
    return c.json({ data: sr }, 201);
  },

  async changeStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const sr = await prisma.serviceRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!sr) return c.json(new NotFoundError('Servis Talebi', id).toJSON(), 404);

    const body = await c.req.json<{ status: ServiceStatus; notes?: string }>();
    if (!body.status) return c.json(new ValidationError('status zorunludur.').toJSON(), 400);

    const allowed = STATUS_TRANSITIONS[sr.status];
    if (!allowed.includes(body.status)) {
      return c.json(new ValidationError(`${sr.status} → ${body.status} geçişi yapılamaz.`).toJSON(), 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.serviceRequest.update({
        where: { id },
        data: {
          status: body.status,
          closedAt: ['COMPLETED', 'CANCELLED'].includes(body.status) ? new Date() : null,
        },
      });
      await tx.serviceRequestHistory.create({
        data: { tenantId, serviceRequestId: id, fromStatus: sr.status, toStatus: body.status, notes: body.notes ?? null },
      });
      await tx.serviceActivity.create({
        data: { tenantId, serviceRequestId: id, activityType: 'STATUS_CHANGE', notes: `${sr.status} → ${body.status}${body.notes ? ': ' + body.notes : ''}` },
      });
      return result;
    });

    return c.json({ data: updated });
  },

  async assign(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const sr = await prisma.serviceRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!sr) return c.json(new NotFoundError('Servis Talebi', id).toJSON(), 404);

    const body = await c.req.json<{ assignedToId: string | null }>();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.serviceRequest.update({ where: { id }, data: { assignedToId: body.assignedToId } });
      await tx.serviceActivity.create({
        data: { tenantId, serviceRequestId: id, activityType: 'ASSIGNMENT', notes: body.assignedToId ? `Atandı: ${body.assignedToId}` : 'Atama kaldırıldı' },
      });
      return result;
    });
    return c.json({ data: updated });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.serviceRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Servis Talebi', id).toJSON(), 404);

    const body = await c.req.json<{ subject?: string; description?: string; priority?: Priority }>();
    const updated = await prisma.serviceRequest.update({
      where: { id },
      data: {
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.priority !== undefined && { priority: body.priority }),
      },
    });
    return c.json({ data: updated });
  },

  // ─── Items ──────────────────────────────────

  async addItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const srId = requireParam(c, 'id');

    const sr = await prisma.serviceRequest.findFirst({ where: { id: srId, tenantId, deletedAt: null } });
    if (!sr) return c.json(new NotFoundError('Servis Talebi', srId).toJSON(), 404);

    const body = await c.req.json<{ description: string; productId?: string; quantity?: number; unitPrice?: number }>();
    if (!body.description) return c.json(new ValidationError('description zorunludur.').toJSON(), 400);

    const qty = body.quantity ?? 1;
    const price = body.unitPrice ?? 0;

    const item = await prisma.serviceRequestItem.create({
      data: {
        tenantId, serviceRequestId: srId, description: body.description,
        productId: body.productId ?? null, quantity: qty, unitPrice: price, lineTotal: qty * price,
      },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    return c.json({ data: item }, 201);
  },

  async removeItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const itemId = requireParam(c, 'itemId');

    const item = await prisma.serviceRequestItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return c.json(new NotFoundError('Servis Kalemi', itemId).toJSON(), 404);

    await prisma.serviceRequestItem.delete({ where: { id: itemId } });
    return c.json({ data: { success: true } });
  },

  // ─── Activities ─────────────────────────────

  async addActivity(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const srId = requireParam(c, 'id');

    const sr = await prisma.serviceRequest.findFirst({ where: { id: srId, tenantId, deletedAt: null } });
    if (!sr) return c.json(new NotFoundError('Servis Talebi', srId).toJSON(), 404);

    const body = await c.req.json<{ activityType: ServiceActivityType; notes?: string }>();
    if (!body.activityType) return c.json(new ValidationError('activityType zorunludur.').toJSON(), 400);

    const activity = await prisma.serviceActivity.create({
      data: { tenantId, serviceRequestId: srId, activityType: body.activityType, notes: body.notes ?? null },
    });
    return c.json({ data: activity }, 201);
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const sr = await prisma.serviceRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!sr) return c.json(new NotFoundError('Servis Talebi', id).toJSON(), 404);

    await prisma.serviceRequest.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.json({ data: { success: true } });
  },

  async checkSlaBreaches(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const activeRequests = await prisma.serviceRequest.findMany({
      where: {
        tenantId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_CUSTOMER'] },
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
      const sla = calculateSla(request.createdAt, request.priority, request.status, request.closedAt);
      if (sla.isBreached) {
        breached.push(`${request.number} (${request.subject})`);
      }
    }

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'service',
      entityType: EntityType.OTHER,
      entityId: 'sla_sweep',
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
};
