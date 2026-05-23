import { Context } from 'hono';
import { DeliveryNoteType, DeliveryNoteStatus, AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { requireTenantId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface DeliveryNoteListQuery {
  page?: string;
  limit?: string;
  type?: DeliveryNoteType;
  status?: DeliveryNoteStatus;
  salesOrderId?: string;
  purchaseOrderId?: string;
  contactId?: string;
}

interface CreateDeliveryNoteDTO {
  type: DeliveryNoteType;
  salesOrderId?: string;
  purchaseOrderId?: string;
  contactId?: string;
  warehouseId: string;
  date: string;
  trackingNumber?: string;
  carrier?: string;
  notes?: string;
  items: Array<{
    productId: string;
    description?: string;
    orderedQty: number;
    deliveredQty: number;
    locationId?: string;
    lotId?: string;
    batchId?: string;
    salesOrderItemId?: string;
    purchaseOrderItemId?: string;
    sortOrder?: number;
  }>;
}

interface UpdateDeliveryNoteStatusDTO {
  status: DeliveryNoteStatus;
  shippedAt?: string;
  deliveredAt?: string;
}

// ─────────────────────────────────────────────
// Delivery Note Controller
// ─────────────────────────────────────────────

export const DeliveryNoteController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as DeliveryNoteListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.salesOrderId && { salesOrderId: query.salesOrderId }),
      ...(query.purchaseOrderId && { purchaseOrderId: query.purchaseOrderId }),
      ...(query.contactId && { contactId: query.contactId }),
    };

    const [total, notes] = await prisma.$transaction([
      prisma.deliveryNote.count({ where }),
      prisma.deliveryNote.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
          salesOrder: { select: { id: true, number: true } },
          purchaseOrder: { select: { id: true, number: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: notes,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const note = await prisma.deliveryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        salesOrder: { select: { id: true, number: true } },
        purchaseOrder: { select: { id: true, number: true } },
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!note) return c.json(new NotFoundError('İrsaliye', id).toJSON(), 404);
    return c.json({ data: note });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);

    const body = await c.req.json<CreateDeliveryNoteDTO>();

    if (!body.type || !body.warehouseId || !body.date || !body.items?.length) {
      return c.json(
        new ValidationError('type, warehouseId, date ve en az bir kalem zorunludur.').toJSON(),
        400,
      );
    }
    const number = await generateDocumentNumber(tenantId, 'delivery_note', 'DN-', 'deliveryNote');

    const note = await prisma.$transaction(async (tx) => {
      const newNote = await tx.deliveryNote.create({
        data: {
          tenantId,
          number,
          type: body.type,
          salesOrderId: body.salesOrderId ?? null,
          purchaseOrderId: body.purchaseOrderId ?? null,
          contactId: body.contactId ?? null,
          warehouseId: body.warehouseId,
          date: new Date(body.date),
          trackingNumber: body.trackingNumber ?? null,
          carrier: body.carrier ?? null,
          notes: body.notes ?? null,
          items: {
            create: body.items.map((item) => ({
              tenantId,
              productId: item.productId,
              description: item.description ?? null,
              orderedQty: item.orderedQty,
              deliveredQty: item.deliveredQty,
              locationId: item.locationId ?? null,
              lotId: item.lotId ?? null,
              batchId: item.batchId ?? null,
              salesOrderItemId: item.salesOrderItemId ?? null,
              purchaseOrderItemId: item.purchaseOrderItemId ?? null,
              sortOrder: item.sortOrder ?? 0,
            })),
          },
        },
        include: {
          items: {
            include: { product: { select: { id: true, code: true, name: true } } },
          },
        },
      });

      // SalesOrderItem.delivered güncelle
      for (const item of body.items) {
        if (item.salesOrderItemId && item.deliveredQty > 0) {
          await tx.salesOrderItem.updateMany({
            where: { id: item.salesOrderItemId, tenantId },
            data: { delivered: { increment: item.deliveredQty } },
          });
        }
      }

      // SalesOrder durumunu güncelle (kısmi/tam teslimat)
      if (body.salesOrderId) {
        const orderItems = await tx.salesOrderItem.findMany({
          where: { tenantId, orderId: body.salesOrderId },
          select: { quantity: true, delivered: true },
        });

        if (orderItems.length > 0) {
          const allDelivered = orderItems.every(
            (i) => Number(i.delivered) >= Number(i.quantity),
          );
          const anyDelivered = orderItems.some((i) => Number(i.delivered) > 0);

          if (allDelivered) {
            await tx.salesOrder.updateMany({
              where: { id: body.salesOrderId, tenantId },
              data: { status: 'DELIVERED' },
            });
          } else if (anyDelivered) {
            await tx.salesOrder.updateMany({
              where: { id: body.salesOrderId, tenantId },
              data: { status: 'PARTIALLY_DELIVERED' },
            });
          }
        }
      }

      return newNote;
    });

    await createAuditLog(prisma, {
      tenantId, userId, module: 'inventory',
      entityType: EntityType.DELIVERY_NOTE, entityId: note.id,
      action: AuditAction.CREATE,
      newValues: { number, type: body.type, salesOrderId: body.salesOrderId ?? null },
      ipAddress, userAgent,
    });

    return c.json({ data: note }, 201);
  },

  async updateStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.deliveryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return c.json(new NotFoundError('İrsaliye', id).toJSON(), 404);

    const body = await c.req.json<UpdateDeliveryNoteStatusDTO>();

    if (!body.status) {
      return c.json(new ValidationError('status alanı zorunludur.').toJSON(), 400);
    }

    const updated = await prisma.deliveryNote.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.shippedAt && { shippedAt: new Date(body.shippedAt) }),
        ...(body.deliveredAt && { deliveredAt: new Date(body.deliveredAt) }),
      },
    });

    return c.json({ data: updated });
  },
};
