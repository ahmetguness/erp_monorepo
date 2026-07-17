import { Context } from 'hono';
import { OrderStatus, QuoteStatus, AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { requireTenantId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { createEventContext, domainEvents } from '../domain-events';
import { BusinessRulesService } from '../services/business-rules.service.js';

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
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

const businessRulesService = new BusinessRulesService(prisma);

function parseQuoteStatus(value: string | undefined): QuoteStatus | undefined {
  switch (value) {
    case QuoteStatus.DRAFT:
    case QuoteStatus.SENT:
    case QuoteStatus.ACCEPTED:
    case QuoteStatus.REJECTED:
    case QuoteStatus.EXPIRED:
    case QuoteStatus.CANCELLED:
      return value;
    default:
      return undefined;
  }
}

function parseOrderStatus(value: string | undefined): OrderStatus | undefined {
  switch (value) {
    case OrderStatus.DRAFT:
    case OrderStatus.CONFIRMED:
    case OrderStatus.PARTIALLY_DELIVERED:
    case OrderStatus.DELIVERED:
    case OrderStatus.CANCELLED:
      return value;
    default:
      return undefined;
  }
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

function addDays(baseDate: Date, days: number): Date {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

// ─────────────────────────────────────────────
// Sales Order Controller
// ─────────────────────────────────────────────

export const SalesOrderController = {
  // ── Sales Quotes ─────────────────────────────

  async listQuotes(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as OrderListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const status = parseQuoteStatus(c.req.query('status'));
    const search = query.search?.trim();

    const where = {
      tenantId,
      deletedAt: null,
      ...(status && { status }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' as const } },
          { contact: { name: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
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
    const tenantId = requireTenantId(c);
    const quoteId = c.req.param('id');

    const quote = await prisma.salesQuote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true, email: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });

    if (!quote) return c.json(new NotFoundError('Teklif', quoteId).toJSON(), 404);
    return c.json({ data: quote });
  },

  async createQuote(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateSalesQuoteDTO>();

    if (!body.contactId || !body.date || !body.items?.length) {
      return c.json(new ValidationError('contactId, date ve en az bir kalem zorunludur.').toJSON(), 400);
    }

    const { lineData, totalNet, totalTax, totalGross } = computeItems(body.items);

    let number = body.number;
    if (!number) {
      number = await generateDocumentNumber(tenantId, 'sales_quote', 'TKL-', 'salesQuote');
    }
    const quoteDate = new Date(body.date);
    const quoteValidityDays = await businessRulesService.getNumber(tenantId, 'sales.quote_validity_days');

    const quote = await prisma.salesQuote.create({
      data: {
        tenantId,
        contactId: body.contactId,
        number,
        date: quoteDate,
        validUntil: body.validUntil ? new Date(body.validUntil) : addDays(quoteDate, quoteValidityDays),
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
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const quoteId = c.req.param('id');

    const quote = await prisma.salesQuote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!quote) return c.json(new NotFoundError('Teklif', quoteId).toJSON(), 404);

    if (quote.status !== QuoteStatus.ACCEPTED && quote.status !== QuoteStatus.DRAFT) {
      return c.json(new ValidationError('Sadece taslak veya kabul edilmiş teklifler siparişe dönüştürülebilir.').toJSON(), 400);
    }
    const number = await generateDocumentNumber(tenantId, 'sales_order', 'SIP-', 'salesOrder');

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

    await domainEvents.publish({
      name: 'salesQuote.accepted',
      context: createEventContext({ tenantId, userId }),
      payload: {
        quoteId: quote.id,
        orderId: order.id,
        quoteNumber: quote.number,
        orderNumber: order.number,
        contactId: quote.contactId,
        totalGross: Number(quote.totalGross),
      },
    });

    return c.json({ data: order }, 201);
  },

  // ── Sales Orders ─────────────────────────────

  async listOrders(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as OrderListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const search = query.search?.trim();
    const status = parseOrderStatus(c.req.query('status'));

    const where = {
      tenantId,
      deletedAt: null,
      ...(status && { status }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' as const } },
          { contact: { name: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
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
    const tenantId = requireTenantId(c);
    const orderId = c.req.param('id');

    const order = await prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true, email: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
        invoices: { select: { id: true, number: true, status: true, totalGross: true } },
      },
    });

    if (!order) return c.json(new NotFoundError('Sipariş', orderId).toJSON(), 404);
    return c.json({ data: order });
  },

  async getOrderHistory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const orderId = c.req.param('id');

    const order = await prisma.salesOrder.findFirst({ where: { id: orderId, tenantId, deletedAt: null } });
    if (!order) return c.json(new NotFoundError('Sipariş', orderId).toJSON(), 404);

    const history = await prisma.salesOrderHistory.findMany({
      where: { tenantId, orderId },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: history });
  },

  async createOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);

    const body = await c.req.json<CreateSalesOrderDTO>();

    if (!body.contactId || !body.date || !body.items?.length) {
      return c.json(new ValidationError('contactId, date ve en az bir kalem zorunludur.').toJSON(), 400);
    }

    const { lineData, totalNet, totalTax, totalGross } = computeItems(body.items);

    let number = body.number;
    if (!number) {
      number = await generateDocumentNumber(tenantId, 'sales_order', 'SIP-', 'salesOrder');
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

    await createAuditLog(prisma, {
      tenantId, userId, module: 'invoicing',
      entityType: EntityType.SALES_ORDER, entityId: order.id,
      action: AuditAction.CREATE,
      newValues: { number: order.number, contactId: body.contactId, totalGross },
      ipAddress, userAgent,
    });

    return c.json({ data: order }, 201);
  },

  async updateOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const orderId = c.req.param('id');

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
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);
    const orderId = c.req.param('id');

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

    await createAuditLog(prisma, {
      tenantId, userId, module: 'invoicing',
      entityType: EntityType.SALES_ORDER, entityId: orderId!,
      action: AuditAction.UPDATE,
      oldValues: { status: order.status },
      newValues: { status: OrderStatus.CANCELLED },
      ipAddress, userAgent,
    });

    return c.json({ data: updated });
  },
};
