import { Context } from 'hono';
import { PurchaseOrderStatus, PurchaseRequestStatus, AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { requireTenantId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface OrderItemDTO {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

interface CreatePurchaseOrderDTO {
  contactId: string;
  date: string;
  dueDate?: string;
  notes?: string;
  items: OrderItemDTO[];
}

interface CreatePurchaseRequestDTO {
  date: string;
  notes?: string;
  items: Array<{ productId: string; description?: string; quantity: number; unitPrice?: number }>;
}

interface ListQuery {
  page?: string;
  limit?: string;
  status?: string;
  contactId?: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function computeItems(items: OrderItemDTO[]) {
  let totalNet = 0;
  let totalTax = 0;
  const lineData = items.map((item, idx) => {
    const discount = item.discount ?? 0;
    const taxRate = item.taxRate ?? 0;
    const net = item.quantity * item.unitPrice * (1 - discount / 100);
    const taxAmount = net * (taxRate / 100);
    const lineTotal = net + taxAmount;
    totalNet += net;
    totalTax += taxAmount;
    return {
      productId: item.productId, description: item.description ?? null,
      quantity: item.quantity, unitPrice: item.unitPrice,
      discount, taxRate, taxAmount, lineTotal, sortOrder: idx,
    };
  });
  return { lineData, totalNet, totalTax, totalGross: totalNet + totalTax };
}

// ─────────────────────────────────────────────
// Purchase Order Controller
// ─────────────────────────────────────────────

export const PurchaseOrderController = {

  // ── Purchase Requests ────────────────────────

  async listRequests(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const where = {
      tenantId, deletedAt: null,
      ...(query.status && { status: query.status as PurchaseRequestStatus }),
    };

    const [total, requests] = await prisma.$transaction([
      prisma.purchaseRequest.count({ where }),
      prisma.purchaseRequest.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: { items: { include: { product: { select: { id: true, code: true, name: true } } } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    return c.json({ data: requests, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async createRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreatePurchaseRequestDTO>();
    if (!body.date || !body.items?.length) {
      return c.json(new ValidationError('date ve en az bir kalem zorunludur.').toJSON(), 400);
    }
    const number = await generateDocumentNumber(tenantId, 'purchase_request', 'PR-', 'purchaseRequest');

    const totalEstimated = body.items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity, 0);

    const request = await prisma.purchaseRequest.create({
      data: {
        tenantId, number, date: new Date(body.date),
        status: PurchaseRequestStatus.DRAFT,
        notes: body.notes ?? null,
        totalEstimated: totalEstimated > 0 ? totalEstimated : null,
        items: {
          create: body.items.map((i) => ({
            tenantId, productId: i.productId,
            description: i.description ?? null,
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? null,
          })),
        },
      },
      include: { items: { include: { product: { select: { id: true, code: true, name: true } } } } },
    });

    return c.json({ data: request }, 201);
  },

  async approveRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');

    const request = await prisma.purchaseRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!request) return c.json(new NotFoundError('Satın alma talebi', id).toJSON(), 404);

    if (request.status !== PurchaseRequestStatus.DRAFT && request.status !== PurchaseRequestStatus.PENDING_APPROVAL) {
      return c.json(new ValidationError('Sadece taslak veya onay bekleyen talepler onaylanabilir.').toJSON(), 400);
    }

    const updated = await prisma.purchaseRequest.update({
      where: { id },
      data: { status: PurchaseRequestStatus.APPROVED, approvedAt: new Date() },
    });

    return c.json({ data: updated });
  },

  async convertRequestToOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');

    const body = await c.req.json<{ contactId: string }>();
    if (!body.contactId) return c.json(new ValidationError('contactId zorunludur.').toJSON(), 400);

    const request = await prisma.purchaseRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!request) return c.json(new NotFoundError('Satın alma talebi', id).toJSON(), 404);
    if (request.status !== PurchaseRequestStatus.APPROVED) {
      return c.json(new ValidationError('Sadece onaylı talepler siparişe dönüştürülebilir.').toJSON(), 400);
    }
    const number = await generateDocumentNumber(tenantId, 'purchase_order', 'PO-', 'purchaseOrder');

    const items: OrderItemDTO[] = request.items.map((i) => ({
      productId: i.productId,
      description: i.description ?? undefined,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice ?? 0),
    }));
    const { lineData, totalNet, totalTax, totalGross } = computeItems(items);

    const order = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId, contactId: body.contactId, number,
          date: new Date(), status: PurchaseOrderStatus.DRAFT,
          totalNet, totalTax, totalGross,
          notes: `Talepten dönüştürüldü: ${request.number}`,
          items: { create: lineData.map((l) => ({ tenantId, ...l })) },
        },
        include: { items: true, contact: { select: { id: true, name: true } } },
      });

      await tx.purchaseRequest.update({
        where: { id },
        data: { status: PurchaseRequestStatus.ORDERED, purchaseOrderId: po.id },
      });

      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: po.id, toStatus: PurchaseOrderStatus.DRAFT, notes: `Talepten oluşturuldu: ${request.number}` },
      });

      return po;
    });

    return c.json({ data: order }, 201);
  },

  // ── Purchase Orders ──────────────────────────

  async listOrders(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const where = {
      tenantId, deletedAt: null,
      ...(query.status && { status: query.status as PurchaseOrderStatus }),
      ...(query.contactId && { contactId: query.contactId }),
    };

    const [total, orders] = await prisma.$transaction([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          contact: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    return c.json({ data: orders, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async getOrderById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, code: true, email: true } },
        items: {
          include: { product: { select: { id: true, code: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) return c.json(new NotFoundError('Satın alma siparişi', id).toJSON(), 404);
    return c.json({ data: order });
  },

  async getOrderHistory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');

    const order = await prisma.purchaseOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!order) return c.json(new NotFoundError('Satın alma siparişi', id).toJSON(), 404);

    const history = await prisma.purchaseOrderHistory.findMany({
      where: { tenantId, orderId: id },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: history });
  },

  async createOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);

    const body = await c.req.json<CreatePurchaseOrderDTO>();
    if (!body.contactId || !body.date || !body.items?.length) {
      return c.json(new ValidationError('contactId, date ve en az bir kalem zorunludur.').toJSON(), 400);
    }
    const number = await generateDocumentNumber(tenantId, 'purchase_order', 'PO-', 'purchaseOrder');

    const { lineData, totalNet, totalTax, totalGross } = computeItems(body.items);

    const order = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId, contactId: body.contactId, number,
          date: new Date(body.date),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          status: PurchaseOrderStatus.DRAFT,
          totalNet, totalTax, totalGross,
          notes: body.notes ?? null,
          items: { create: lineData.map((l) => ({ tenantId, ...l })) },
        },
        include: {
          contact: { select: { id: true, name: true, code: true } },
          items: { include: { product: { select: { id: true, code: true, name: true } } } },
        },
      });

      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: po.id, toStatus: PurchaseOrderStatus.DRAFT },
      });

      return po;
    });

    await createAuditLog(prisma, {
      tenantId, userId, module: 'purchasing',
      entityType: EntityType.PURCHASE_ORDER, entityId: order.id,
      action: AuditAction.CREATE,
      newValues: { number: order.number, contactId: body.contactId, totalGross },
      ipAddress, userAgent,
    });

    return c.json({ data: order }, 201);
  },

  async sendOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const order = await prisma.purchaseOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!order) return c.json(new NotFoundError('Satın alma siparişi', id).toJSON(), 404);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      return c.json(new ValidationError('Sadece taslak siparişler gönderilebilir.').toJSON(), 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.update({
        where: { id }, data: { status: PurchaseOrderStatus.SENT },
      });
      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: id, fromStatus: PurchaseOrderStatus.DRAFT, toStatus: PurchaseOrderStatus.SENT },
      });
      return po;
    });

    return c.json({ data: updated });
  },

  async receiveOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const body = await c.req.json<{
      warehouseId: string;
      items: Array<{ itemId: string; receivedQty: number }>;
    }>();

    if (!body.warehouseId || !body.items?.length) {
      return c.json(new ValidationError('warehouseId ve items zorunludur.').toJSON(), 400);
    }

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!order) return c.json(new NotFoundError('Satın alma siparişi', id).toJSON(), 404);

    if (order.status !== PurchaseOrderStatus.SENT && order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      return c.json(new ValidationError('Sadece gönderilmiş veya kısmi teslim alınmış siparişler teslim alınabilir.').toJSON(), 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const recv of body.items) {
        const orderItem = order.items.find((i) => i.id === recv.itemId);
        if (!orderItem) continue;

        // Update received quantity
        await tx.purchaseOrderItem.updateMany({
          where: { id: recv.itemId, tenantId, orderId: id },
          data: { received: { increment: recv.receivedQty } },
        });

        // Create stock movement (IN)
        await tx.stockMovement.create({
          data: {
            tenantId, productId: orderItem.productId,
            type: 'IN', quantity: recv.receivedQty,
            unitCost: orderItem.unitPrice,
            toWarehouseId: body.warehouseId,
            notes: `Satın alma teslimi: ${order.number}`,
          },
        });

        // Update stock level — find existing to match locationId
        const existingLevel = await tx.stockLevel.findFirst({
          where: { tenantId, productId: orderItem.productId, warehouseId: body.warehouseId },
        });
        const locId = existingLevel?.locationId ?? '';

        await tx.stockLevel.upsert({
          where: {
            productId_warehouseId_locationId: {
              productId: orderItem.productId,
              warehouseId: body.warehouseId,
              locationId: locId,
            },
          },
          create: {
            tenantId, productId: orderItem.productId,
            warehouseId: body.warehouseId, locationId: locId,
            quantity: recv.receivedQty,
          },
          update: { quantity: { increment: recv.receivedQty } },
        });
      }

      // Check if fully received
      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { tenantId, orderId: id } });
      const allReceived = updatedItems.every((i) => Number(i.received) >= Number(i.quantity));
      const newStatus = allReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      await tx.purchaseOrder.updateMany({
        where: { id, tenantId },
        data: { status: newStatus },
      });

      const po = await tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: { contact: { select: { id: true, name: true } }, items: true },
      });
      if (!po) throw new NotFoundError('SatÄ±n alma sipariÅŸi', id);

      await tx.purchaseOrderHistory.create({
        data: {
          tenantId, orderId: id,
          fromStatus: order.status, toStatus: newStatus,
          notes: `${body.items.length} kalem teslim alındı`,
        },
      });

      return po;
    });

    return c.json({ data: updated });
  },

  async cancelOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const order = await prisma.purchaseOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!order) return c.json(new NotFoundError('Satın alma siparişi', id).toJSON(), 404);

    if (order.status === PurchaseOrderStatus.RECEIVED || order.status === PurchaseOrderStatus.CANCELLED) {
      return c.json(new ValidationError('Teslim alınmış veya iptal edilmiş siparişler iptal edilemez.').toJSON(), 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.update({
        where: { id }, data: { status: PurchaseOrderStatus.CANCELLED },
      });
      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: id, fromStatus: order.status, toStatus: PurchaseOrderStatus.CANCELLED },
      });
      return po;
    });

    return c.json({ data: updated });
  },
};
