import { AuditAction,DeliveryNoteStatus,DeliveryNoteType,EntityType } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { createDeliveryNoteBodySchema, updateDeliveryNoteStatusBodySchema } from '../../../../schemas/request-body.schemas.js';
import { prisma } from '../../../../lib/prisma.js';
import { processDeliveryNoteStock } from '../../../../services/inventory-rules.service.js';
import { createAuditLog,getRequestMeta } from '../../../../utils/audit.js';
import { requireParam,requireTenantId } from '../../../../utils/context.js';
import { generateDocumentNumber } from '../../../../utils/generate-number.js';
import { buildOwnershipChecks,validateTenantOwnership } from '../../../../utils/validateTenantOwnership.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface DeliveryNoteListQuery {
  page?: string;
  limit?: string;
  search?: string;
  type?: DeliveryNoteType;
  status?: DeliveryNoteStatus;
  salesOrderId?: string;
  purchaseOrderId?: string;
  contactId?: string;
  warehouseId?: string;
  carrier?: string;
  dateFrom?: string;
  dateTo?: string;
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
    if (query.type && !Object.values(DeliveryNoteType).includes(query.type)) throw new ValidationError('Gecersiz irsaliye tipi.');
    if (query.status && !Object.values(DeliveryNoteStatus).includes(query.status)) throw new ValidationError('Gecersiz irsaliye durumu.');
    const fromDate = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const toDate = query.dateTo ? new Date(query.dateTo) : undefined;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) throw new ValidationError('Gecersiz tarih filtresi.');
    if (fromDate && toDate && fromDate > toDate) throw new ValidationError('Baslangic tarihi bitis tarihinden sonra olamaz.');
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;
    const search = query.search?.trim();
    const dateWhere = query.dateFrom || query.dateTo
      ? {
          ...(fromDate && { gte: fromDate }),
          ...(toDate && { lte: toDate }),
        }
      : undefined;

    const where = {
      tenantId,
      deletedAt: null,
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' as const } },
          { trackingNumber: { contains: search, mode: 'insensitive' as const } },
          { carrier: { contains: search, mode: 'insensitive' as const } },
          { contact: { name: { contains: search, mode: 'insensitive' as const } } },
          { warehouse: { name: { contains: search, mode: 'insensitive' as const } } },
          { salesOrder: { number: { contains: search, mode: 'insensitive' as const } } },
          { purchaseOrder: { number: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.salesOrderId && { salesOrderId: query.salesOrderId }),
      ...(query.purchaseOrderId && { purchaseOrderId: query.purchaseOrderId }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(query.warehouseId && { warehouseId: query.warehouseId }),
      ...(query.carrier && { carrier: { contains: query.carrier, mode: 'insensitive' as const } }),
      ...(dateWhere && { date: dateWhere }),
    };

    const [total, notes, summaryRows] = await prisma.$transaction([
      prisma.deliveryNote.count({ where }),
      prisma.deliveryNote.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          salesOrder: { select: { id: true, number: true } },
          purchaseOrder: { select: { id: true, number: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.deliveryNote.groupBy({ where, by: ['status'], orderBy: { status: 'asc' }, _count: { _all: true } }),
    ]);

    return c.json({
      data: notes,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      summary: summaryRows.reduce((summary, row) => {
        summary[row.status] = typeof row._count === 'object' ? (row._count?._all ?? 0) : 0;
        return summary;
      }, { DRAFT: 0, CONFIRMED: 0, PARTIALLY_SHIPPED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 } as Record<DeliveryNoteStatus, number>),
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const note = await prisma.deliveryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        salesOrder: { select: { id: true, number: true } },
        purchaseOrder: { select: { id: true, number: true } },
        items: {
          include: {
            product: { select: { id: true, code: true, name: true, barcode: true } },
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

    const body = getValidatedBody(c, createDeliveryNoteBodySchema);

    await validateTenantOwnership(tenantId, buildOwnershipChecks([
      { model: 'warehouse', id: body.warehouseId, label: 'Depo' },
      { model: 'contact', id: body.contactId, label: 'Cari' },
      ...body.items.map((item, index) => ({ model: 'product' as const, id: item.productId, label: `Kalem ${index + 1} urunu` })),
    ]));
    if (body.salesOrderId) {
      if (body.type !== DeliveryNoteType.OUTBOUND) throw new ValidationError('Satis siparisine yalnizca sevk irsaliyesi baglanabilir.');
      const order = await prisma.salesOrder.findFirst({ where: { id: body.salesOrderId, tenantId, deletedAt: null } });
      if (!order) throw new NotFoundError('Satis siparisi', body.salesOrderId);
      if (body.contactId && body.contactId !== order.contactId) throw new ValidationError('Irsaliye carisi satis siparisi carisi ile ayni olmalidir.');
    }
    if (body.purchaseOrderId) {
      if (body.type !== DeliveryNoteType.INBOUND) throw new ValidationError('Alis siparisine yalnizca giris irsaliyesi baglanabilir.');
      const order = await prisma.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId, deletedAt: null } });
      if (!order) throw new NotFoundError('Alis siparisi', body.purchaseOrderId);
      if (body.contactId && body.contactId !== order.contactId) throw new ValidationError('Irsaliye carisi alis siparisi carisi ile ayni olmalidir.');
    }
    for (const item of body.items) {
      if (item.salesOrderItemId) {
        const linked = await prisma.salesOrderItem.findFirst({ where: { id: item.salesOrderItemId, tenantId, orderId: body.salesOrderId, productId: item.productId } });
        if (!linked) throw new ValidationError('Satis siparisi kalemi irsaliye siparisi ve urunu ile eslesmiyor.');
        if (item.deliveredQty > Number(linked.quantity) - Number(linked.delivered)) throw new ValidationError('Teslim miktari siparis kaleminin kalan miktarini asamaz.');
      }
      if (item.purchaseOrderItemId) {
        const linked = await prisma.purchaseOrderItem.findFirst({ where: { id: item.purchaseOrderItemId, tenantId, orderId: body.purchaseOrderId, productId: item.productId } });
        if (!linked) throw new ValidationError('Alis siparisi kalemi irsaliye siparisi ve urunu ile eslesmiyor.');
      }
    }

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
      // A draft is intentionally side-effect free. Quantities and stock are
      // applied exactly once when the note enters an active status.

      // SalesOrder durumunu güncelle (kısmi/tam teslimat)
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
    const id = requireParam(c, 'id');

    const existing = await prisma.deliveryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return c.json(new NotFoundError('İrsaliye', id).toJSON(), 404);

    const body = getValidatedBody(c, updateDeliveryNoteStatusBodySchema);

    const allowed: Record<DeliveryNoteStatus, DeliveryNoteStatus[]> = {
      DRAFT: [DeliveryNoteStatus.CONFIRMED, DeliveryNoteStatus.SHIPPED, DeliveryNoteStatus.DELIVERED, DeliveryNoteStatus.CANCELLED],
      CONFIRMED: [DeliveryNoteStatus.SHIPPED],
      PARTIALLY_SHIPPED: [DeliveryNoteStatus.SHIPPED],
      SHIPPED: [DeliveryNoteStatus.DELIVERED],
      DELIVERED: [], CANCELLED: [],
    };
    if (!allowed[existing.status].includes(body.status)) {
      throw new ValidationError(`${existing.status} durumundan ${body.status} durumuna gecilemez.`);
    }

    if (!body.status) {
      return c.json(new ValidationError('status alanı zorunludur.').toJSON(), 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.deliveryNote.updateMany({
        where: { id, tenantId, status: existing.status, deletedAt: null }, data: { status: body.status },
      });
      if (claimed.count !== 1) throw new ConflictError('Irsaliye durumu es zamanli olarak degisti.');
      const up = await tx.deliveryNote.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.shippedAt && { shippedAt: new Date(body.shippedAt) }),
        ...(body.deliveredAt && { deliveredAt: new Date(body.deliveredAt) }),
      },
      });

      // Fulfillment creates a draft with deliveredQty=0. Activating that draft
      // represents shipping its ordered quantities; without this step no stock
      // movement was produced and the linked invoice could never be approved.
      if (
        existing.status === DeliveryNoteStatus.DRAFT
        && (body.status === DeliveryNoteStatus.CONFIRMED
          || body.status === DeliveryNoteStatus.SHIPPED
          || body.status === DeliveryNoteStatus.DELIVERED)
      ) {
        const items = await tx.deliveryNoteItem.findMany({ where: { tenantId, deliveryNoteId: id } });
        for (const item of items) {
          const requested = Number(item.deliveredQty);
          const quantityToApply = requested > 0 ? requested : Number(item.orderedQty);
          if (requested <= 0) {
            await tx.deliveryNoteItem.update({ where: { id: item.id }, data: { deliveredQty: quantityToApply } });
          }
          if (item.salesOrderItemId) {
            await tx.salesOrderItem.updateMany({
              where: { id: item.salesOrderItemId, tenantId },
              data: { delivered: { increment: quantityToApply } },
            });
          }
        }

        if (existing.salesOrderId) {
          const orderItems = await tx.salesOrderItem.findMany({
            where: { tenantId, orderId: existing.salesOrderId },
            select: { quantity: true, delivered: true },
          });
          const allDelivered = orderItems.length > 0
            && orderItems.every((item) => Number(item.delivered) >= Number(item.quantity));
          await tx.salesOrder.updateMany({
            where: { id: existing.salesOrderId, tenantId },
            data: { status: allDelivered ? 'DELIVERED' : 'PARTIALLY_DELIVERED' },
          });
        }
      }

      await processDeliveryNoteStock(tx, tenantId, id);
      return up;
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const existing = await prisma.deliveryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { eDocuments: true } } },
    });
    if (!existing) return c.json(new NotFoundError('Irsaliye', id).toJSON(), 404);
    if (existing.status !== DeliveryNoteStatus.DRAFT && existing.status !== DeliveryNoteStatus.CANCELLED) {
      throw new ValidationError('Stok etkisi olusmus irsaliye silinemez. Once ters hareket uygulanmalidir.');
    }
    if (existing._count.eDocuments > 0) throw new ValidationError('E-belgeye bagli irsaliye silinemez.');
    await prisma.deliveryNote.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.body(null, 204);
  },
};
