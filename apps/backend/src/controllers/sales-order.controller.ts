import { Context } from 'hono';
import { OrderStatus, QuoteStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

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

interface CreateSalesQuoteDTO {
  contactId: string;
  number?: string;
  date: string;
  validUntil?: string;
  notes?: string;
  items: OrderItemDTO[];
}

interface CreateSalesOrderDTO {
  contactId: string;
  quoteId?: string;
  number?: string;
  date: string;
  dueDate?: string;
  notes?: string;
  items: OrderItemDTO[];
}

interface UpdateOrderDTO {
  dueDate?: string;
  notes?: string;
  status?: OrderStatus;
}

interface OrderListQuery {
  page?: string;
  limit?: string;
  status?: OrderStatus;
  contactId?: string;
  dateFrom?: string;
  dateTo?: string;
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
      productId: item.productId,
      description: item.description ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount,
      taxRate,
      taxAmount,
      lineTotal,
      sortOrder: idx,
    };
  });

  return { lineData, totalNet, totalTax, totalGross: totalNet + totalTax };
}

// ─────────────────────────────────────────────
// Sales Order Controller
// ─────────────────────────────────────────────

export const SalesOrderController = {
  // ── Sales Quotes ─────────────────────────────

  async listQuotes(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as OrderListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.contactId && { contactId: query.contactId }),
      ...(query.dateFrom || query.dateTo
        ? { date: { ...(query.dateFrom && { gte: new Date(query.dateFrom) }), ...(query.dateTo && { lte: new Date(query.dateTo) }) } }
        : {}),
    };

    const [total, quotes] = await prisma.$transaction([
      prisma.salesQuote.count({ where }),
      prisma.salesQuote.findMany({
        where,
        include: { contact: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return c.json({ data: quotes, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async getQuoteById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const quoteId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const quote = await prisma.salesQuote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });

    if (!quote) return c.json(new NotFoundError('Teklif', quoteId).toJSON(), 404);
    return c.json({ data: quote });
  },

  async createQuote(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateSalesQuoteDTO>();

    if (!body.contactId || !body.date || !body.items?.length) {
      return c.json(new ValidationError('contactId, date ve en az bir kalem zorunludur.').toJSON(), 400);
    }

    const { lineData, totalNet, totalTax, totalGross } = computeItems(body.items);

    let number = body.number;
    if (!number) {
      const { generateDocumentNumber } = await import('../utils/generate-number');
      number = await generateDocumentNumber(tenantId, 'sales_quote', 'TKL-', async (tid, num) => {
        const found = await prisma.salesQuote.findFirst({ where: { tenantId: tid, number: num }, select: { id: true } });
        return !!found;
      });
    }

    const quote = await prisma.salesQuote.create({
      data: {
        tenantId,
        contactId: body.contactId,
        number,
        date: new Date(body.date),
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        notes: body.notes ?? null,
        totalNet,
        totalTax,
        totalGross,
        items: { create: lineData.map((l) => ({ ...l, tenantId })) },
      },
      include: { items: true, contact: { select: { id: true, name: true } } },
    });

    return c.json({ data: quote }, 201);
  },

  async convertQuoteToOrder(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const quoteId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const quote = await prisma.salesQuote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!quote) return c.json(new NotFoundError('Teklif', quoteId).toJSON(), 404);

    if (quote.status !== QuoteStatus.ACCEPTED && quote.status !== QuoteStatus.DRAFT) {
      return c.json(new ValidationError('Sadece taslak veya kabul edilmiş teklifler siparişe dönüştürülebilir.').toJSON(), 400);
    }

    const { generateDocumentNumber } = await import('../utils/generate-number');
    const number = await generateDocumentNumber(tenantId, 'sales_order', 'SIP-', async (tid, num) => {
      const found = await prisma.salesOrder.findFirst({ where: { tenantId: tid, number: num }, select: { id: true } });
      return !!found;
    });

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.salesOrder.create({
        data: {
          tenantId,
          contactId: quote.contactId,
          quoteId: quote.id,
          number,
          date: new Date(),
          totalNet: quote.totalNet,
          totalTax: quote.totalTax,
          totalGross: quote.totalGross,
          notes: quote.notes,
          items: {
            create: quote.items.map((item) => ({
              tenantId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              taxRate: item.taxRate,
              taxAmount: item.taxAmount,
              lineTotal: item.lineTotal,
              sortOrder: item.sortOrder,
            })),
          },
        },
        include: { items: true },
      });

      await tx.salesQuote.update({
        where: { id: quoteId },
        data: { status: QuoteStatus.ACCEPTED },
      });

      return newOrder;
    });

    await prisma.salesOrderHistory.create({
      data: { tenantId, orderId: order.id, toStatus: 'DRAFT', notes: `Tekliften dönüştürüldü: ${quote.number}` },
    });

    return c.json({ data: order }, 201);
  },

  // ── Sales Orders ─────────────────────────────

  async listOrders(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as OrderListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(query.dateFrom || query.dateTo
        ? { date: { ...(query.dateFrom && { gte: new Date(query.dateFrom) }), ...(query.dateTo && { lte: new Date(query.dateTo) }) } }
        : {}),
    };

    const [total, orders] = await prisma.$transaction([
      prisma.salesOrder.count({ where }),
      prisma.salesOrder.findMany({
        where,
        include: { contact: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return c.json({ data: orders, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async getOrderById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const orderId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const order = await prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
        invoices: { select: { id: true, number: true, status: true, totalGross: true } },
      },
    });

    if (!order) return c.json(new NotFoundError('Sipariş', orderId).toJSON(), 404);
    return c.json({ data: order });
  },

  async createOrder(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateSalesOrderDTO>();

    if (!body.contactId || !body.date || !body.items?.length) {
      return c.json(new ValidationError('contactId, date ve en az bir kalem zorunludur.').toJSON(), 400);
    }

    const { lineData, totalNet, totalTax, totalGross } = computeItems(body.items);

    let number = body.number;
    if (!number) {
      const { generateDocumentNumber } = await import('../utils/generate-number');
      number = await generateDocumentNumber(tenantId, 'sales_order', 'SIP-', async (tid, num) => {
        const found = await prisma.salesOrder.findFirst({ where: { tenantId: tid, number: num }, select: { id: true } });
        return !!found;
      });
    }

    const order = await prisma.salesOrder.create({
      data: {
        tenantId,
        contactId: body.contactId,
        quoteId: body.quoteId ?? null,
        number,
        date: new Date(body.date),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        totalNet,
        totalTax,
        totalGross,
        items: { create: lineData.map((l) => ({ ...l, tenantId })) },
      },
      include: { items: true, contact: { select: { id: true, name: true } } },
    });

    await prisma.salesOrderHistory.create({
      data: { tenantId, orderId: order.id, toStatus: 'DRAFT', notes: 'Sipariş oluşturuldu' },
    });

    return c.json({ data: order }, 201);
  },

  async updateOrder(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const orderId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const order = await prisma.salesOrder.findFirst({ where: { id: orderId, tenantId, deletedAt: null } });
    if (!order) return c.json(new NotFoundError('Sipariş', orderId).toJSON(), 404);

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.DELIVERED) {
      return c.json(new ValidationError('Bu sipariş artık düzenlenemez.').toJSON(), 400);
    }

    const body = await c.req.json<UpdateOrderDTO>();

    const updated = await prisma.salesOrder.update({
      where: { id: orderId },
      data: {
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    if (body.status && body.status !== order.status) {
      await prisma.salesOrderHistory.create({
        data: { tenantId, orderId: orderId!, fromStatus: order.status, toStatus: body.status },
      });
    }

    return c.json({ data: updated });
  },

  async cancelOrder(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const orderId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const order = await prisma.salesOrder.findFirst({ where: { id: orderId, tenantId, deletedAt: null } });
    if (!order) return c.json(new NotFoundError('Sipariş', orderId).toJSON(), 404);

    if (order.status === OrderStatus.CANCELLED) {
      return c.json(new ValidationError('Sipariş zaten iptal edilmiş.').toJSON(), 400);
    }

    const updated = await prisma.salesOrder.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    await prisma.salesOrderHistory.create({
      data: { tenantId, orderId: orderId!, fromStatus: order.status, toStatus: OrderStatus.CANCELLED, notes: 'Sipariş iptal edildi' },
    });

    return c.json({ data: updated });
  },
};
