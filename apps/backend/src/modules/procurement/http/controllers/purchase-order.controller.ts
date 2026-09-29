import { AuditAction,ContactType,EntityType,PurchaseOrderStatus,PurchaseRequestStatus } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getAccessContext } from '../../../../middleware/access-context.js';
import { PurchaseAutomationService } from '../../../../services/purchase-automation.service.js';
import { PurchaseThreeWayMatchService } from '../../../../services/purchase-three-way-match.service.js';
import { PurchaseTraceService } from '../../../../services/purchase-trace.service.js';
import { createAuditLog,getRequestMeta } from '../../../../utils/audit.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';
import { generateDocumentNumber } from '../../../../utils/generate-number.js';
import { inventoryApplication,parseConfirmGoodsReceipt } from '../../../inventory/index.js';
import { parsePurchaseRequestConvert,parsePurchaseRequestCreate,parsePurchaseRequestList,parsePurchaseRequestTransition } from '../schemas/purchase-request.schema.js';
import { parsePurchaseOrderCreate,parsePurchaseOrderList } from '../schemas/purchase-order.schema.js';

// ---------------------------------------------
// DTOs
// ---------------------------------------------

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
  search?: string;
  status?: string;
  contactId?: string;
  dateFrom?: string;
  dateTo?: string;
  minTotal?: string;
  maxTotal?: string;
  dueFrom?: string;
  dueTo?: string;
}

// ---------------------------------------------
// Helpers
// ---------------------------------------------

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

const PURCHASE_REQUEST_AUDIT_MODULE = 'purchasing.purchase-request';

async function transitionPurchaseRequest(
  c: Context,
  allowedFrom: PurchaseRequestStatus[],
  toStatus: PurchaseRequestStatus,
  action: AuditAction,
): Promise<Response> {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const id = requireParam(c, 'id');
  const body = parsePurchaseRequestTransition(await c.req.json<unknown>().catch(() => ({})));
  if (!body) return c.json(new ValidationError('Durum değişikliği isteği geçersiz.').toJSON(), 400);
  const meta = getRequestMeta(c);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${id}))`;
    const request = await tx.purchaseRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!request) throw new NotFoundError('Satın alma talebi', id);
    if (!allowedFrom.includes(request.status)) {
      throw new ConflictError(`${request.status} durumundaki talep ${toStatus} durumuna geçirilemez.`);
    }
    const result = await tx.purchaseRequest.update({
      where: { id },
      data: { status: toStatus },
      include: { items: { include: { product: { select: { id: true, code: true, name: true } } } } },
    });
    await createAuditLog(tx, {
      tenantId, userId, module: PURCHASE_REQUEST_AUDIT_MODULE,
      entityType: EntityType.OTHER, entityId: id, action,
      oldValues: { status: request.status }, newValues: { status: toStatus },
      reason: body.reason ?? null, ...meta,
    });
    return result;
  });

  return c.json({ data: updated });
}

// ---------------------------------------------
// Purchase Order Controller
// ---------------------------------------------

export const PurchaseOrderController = {

  // -- Purchase Requests ------------------------

  async listRequests(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = parsePurchaseRequestList(c.req.query());
    if (!query) return c.json(new ValidationError('Satın alma talebi filtreleri geçersiz.').toJSON(), 400);
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 20;
    const search = query.search?.trim();
    const minTotal = query.minTotal;
    const maxTotal = query.maxTotal;
    const dateWhere = query.dateFrom || query.dateTo
      ? {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        }
      : undefined;
    const totalWhere = Number.isFinite(minTotal) || Number.isFinite(maxTotal)
      ? {
          ...(Number.isFinite(minTotal) && { gte: minTotal }),
          ...(Number.isFinite(maxTotal) && { lte: maxTotal }),
        }
      : undefined;

    const where = {
      tenantId, deletedAt: null,
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' as const } },
          { notes: { contains: search, mode: 'insensitive' as const } },
          { items: { some: { product: { name: { contains: search, mode: 'insensitive' as const } } } } },
          { items: { some: { product: { code: { contains: search, mode: 'insensitive' as const } } } } },
        ],
      }),
      ...(query.status && { status: query.status as PurchaseRequestStatus }),
      ...(dateWhere && { date: dateWhere }),
      ...(totalWhere && { totalEstimated: totalWhere }),
    };

    const [total, requests] = await prisma.$transaction([
      prisma.purchaseRequest.count({ where }),
      prisma.purchaseRequest.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          items: { include: { product: { select: { id: true, code: true, name: true } } } },
          purchaseOrder: { select: { id: true, number: true, status: true } },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    return c.json({ data: requests, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async createRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const userId = requireUserId(c);
    const body = parsePurchaseRequestCreate(await c.req.json<unknown>().catch(() => null));
    if (!body) return c.json(new ValidationError('Talep tarihi, ürünler, pozitif miktarlar ve geçerli fiyatlar zorunludur.').toJSON(), 400);
    const productIds = body.items.map((item) => item.productId);
    const productCount = await prisma.product.count({ where: { tenantId, id: { in: productIds }, deletedAt: null, isActive: true } });
    if (productCount !== productIds.length) return c.json(new ValidationError('Bir veya daha fazla ürün bu tenant içinde bulunamadı ya da aktif değil.').toJSON(), 400);

    const totalEstimated = body.items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity, 0);

    const request = await prisma.$transaction(async (tx) => {
      const number = await generateDocumentNumber(tenantId, 'purchase_request', 'PR-', 'purchaseRequest', tx);
      const created = await tx.purchaseRequest.create({
      data: {
        tenantId, number, date: new Date(body.date),
        status: PurchaseRequestStatus.DRAFT,
        notes: body.notes ?? null,
        totalEstimated: totalEstimated > 0 ? totalEstimated : null,
        requestedBy: userId,
        createdById: userId,
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
      await createAuditLog(tx, {
        tenantId, userId, module: PURCHASE_REQUEST_AUDIT_MODULE,
        entityType: EntityType.OTHER, entityId: created.id, action: AuditAction.CREATE,
        newValues: { status: created.status, number: created.number }, ...getRequestMeta(c),
      });
      return created;
    });

    return c.json({ data: request }, 201);
  },

  async updateRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');
    const body = parsePurchaseRequestCreate(await c.req.json<unknown>().catch(() => null));
    if (!body) return c.json(new ValidationError('Talep tarihi, ürünler, pozitif miktarlar ve geçerli fiyatlar zorunludur.').toJSON(), 400);
    const productIds = body.items.map((item) => item.productId);
    const productCount = await prisma.product.count({ where: { tenantId, id: { in: productIds }, deletedAt: null, isActive: true } });
    if (productCount !== productIds.length) return c.json(new ValidationError('Bir veya daha fazla ürün bu tenant içinde bulunamadı ya da aktif değil.').toJSON(), 400);
    const totalEstimated = body.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
    const meta = getRequestMeta(c);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${id}))`;
      const request = await tx.purchaseRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!request) throw new NotFoundError('Satın alma talebi', id);
      if (request.status !== PurchaseRequestStatus.DRAFT) throw new ConflictError('Yalnızca taslak satın alma talepleri düzenlenebilir.');
      await tx.purchaseRequestItem.deleteMany({ where: { tenantId, requestId: id } });
      const result = await tx.purchaseRequest.update({
        where: { id },
        data: {
          date: new Date(body.date), notes: body.notes ?? null,
          totalEstimated: totalEstimated > 0 ? totalEstimated : null,
          items: { create: body.items.map((item) => ({
            tenantId, productId: item.productId, description: item.description ?? null,
            quantity: item.quantity, unitPrice: item.unitPrice ?? null,
          })) },
        },
        include: { items: { include: { product: { select: { id: true, code: true, name: true } } } } },
      });
      await createAuditLog(tx, {
        tenantId, userId, module: PURCHASE_REQUEST_AUDIT_MODULE,
        entityType: EntityType.OTHER, entityId: id, action: AuditAction.UPDATE,
        oldValues: { status: request.status, totalEstimated: request.totalEstimated?.toString() ?? null },
        newValues: { status: result.status, totalEstimated: result.totalEstimated?.toString() ?? null }, ...meta,
      });
      return result;
    });
    return c.json({ data: updated });
  },

  async getRequestHistory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const exists = await prisma.purchaseRequest.count({ where: { id, tenantId, deletedAt: null } });
    if (!exists) return c.json(new NotFoundError('Satın alma talebi', id).toJSON(), 404);
    const history = await prisma.auditLog.findMany({
      where: { tenantId, module: PURCHASE_REQUEST_AUDIT_MODULE, entityId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, action: true, oldValues: true, newValues: true, reason: true, createdAt: true },
    });
    return c.json({ data: history });
  },

  async submitRequest(c: Context): Promise<Response> {
    return transitionPurchaseRequest(c, [PurchaseRequestStatus.DRAFT], PurchaseRequestStatus.PENDING_APPROVAL, AuditAction.UPDATE);
  },

  async approveRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');
    const access = getAccessContext(c);
    const meta = getRequestMeta(c);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${id}))`;
      const request = await tx.purchaseRequest.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!request) throw new NotFoundError('Satın alma talebi', id);
      if (request.status !== PurchaseRequestStatus.PENDING_APPROVAL) {
        throw new ConflictError('Yalnızca onay bekleyen talepler onaylanabilir.');
      }
      if (!access?.membership.isOwner && (request.requestedBy === userId || request.createdById === userId)) {
        throw new ValidationError('Talebi oluşturan kullanıcı aynı talebi onaylayamaz.');
      }
      const result = await tx.purchaseRequest.update({
        where: { id },
        data: { status: PurchaseRequestStatus.APPROVED, approvedAt: new Date(), approvedBy: userId },
      });
      await createAuditLog(tx, {
        tenantId, userId, module: PURCHASE_REQUEST_AUDIT_MODULE,
        entityType: EntityType.OTHER, entityId: id, action: AuditAction.APPROVE,
        oldValues: { status: request.status }, newValues: { status: result.status }, ...meta,
      });
      return result;
    });

    return c.json({ data: updated });
  },

  async rejectRequest(c: Context): Promise<Response> {
    return transitionPurchaseRequest(c, [PurchaseRequestStatus.PENDING_APPROVAL], PurchaseRequestStatus.REJECTED, AuditAction.REJECT);
  },

  async cancelRequest(c: Context): Promise<Response> {
    return transitionPurchaseRequest(c, [PurchaseRequestStatus.DRAFT, PurchaseRequestStatus.PENDING_APPROVAL], PurchaseRequestStatus.CANCELLED, AuditAction.UPDATE);
  },

  async convertRequestToOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const body = parsePurchaseRequestConvert(await c.req.json<unknown>().catch(() => null));
    if (!body) return c.json(new ValidationError('Geçerli bir tedarikçi ve ürün fiyatları zorunludur.').toJSON(), 400);
    const supplier = await prisma.contact.findFirst({ where: { id: body.contactId, tenantId, deletedAt: null, isActive: true, type: { in: [ContactType.SUPPLIER, ContactType.BOTH] } }, select: { id: true } });
    if (!supplier) return c.json(new ValidationError('Seçilen tedarikçi bu tenant içinde bulunamadı veya satın almaya uygun değil.').toJSON(), 400);

    const order = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${id}))`;
      const request = await tx.purchaseRequest.findFirst({ where: { id, tenantId, deletedAt: null }, include: { items: true } });
      if (!request) throw new NotFoundError('Satın alma talebi', id);
      if (request.status !== PurchaseRequestStatus.APPROVED || request.purchaseOrderId) throw new ConflictError('Yalnızca onaylı ve daha önce dönüştürülmemiş talepler siparişe dönüştürülebilir.');
      const requestProductIds = new Set(request.items.map((item) => item.productId));
      if (body.items?.some((item) => !requestProductIds.has(item.productId))) throw new ValidationError('Fiyat verilen ürün satın alma talebinde bulunmuyor.');
      const items: OrderItemDTO[] = request.items.map((i) => {
      const customPrice = body.items?.find((item) => item.productId === i.productId)?.unitPrice;
      return {
        productId: i.productId,
        description: i.description ?? undefined,
        quantity: Number(i.quantity),
        unitPrice: customPrice !== undefined ? Number(customPrice) : Number(i.unitPrice ?? 0),
      };
      });
      const { lineData, totalNet, totalTax, totalGross } = computeItems(items);
      const number = await generateDocumentNumber(tenantId, 'purchase_order', 'PO-', 'purchaseOrder', tx);
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId, contactId: body.contactId, number,
          date: new Date(), status: PurchaseOrderStatus.DRAFT,
          totalNet, totalTax, totalGross,
          notes: `Talepten donusturuldu: ${request.number}`,
          createdById: userId,
          items: { create: lineData.map((l) => ({ tenantId, ...l })) },
        },
        include: { items: true, contact: { select: { id: true, name: true } } },
      });

      await tx.purchaseRequest.update({
        where: { id },
        data: { status: PurchaseRequestStatus.ORDERED, purchaseOrderId: po.id },
      });

      await createAuditLog(tx, {
        tenantId, userId, module: PURCHASE_REQUEST_AUDIT_MODULE,
        entityType: EntityType.OTHER, entityId: id, action: AuditAction.UPDATE,
        oldValues: { status: request.status, purchaseOrderId: request.purchaseOrderId },
        newValues: { status: PurchaseRequestStatus.ORDERED, purchaseOrderId: po.id }, ...getRequestMeta(c),
      });

      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: po.id, toStatus: PurchaseOrderStatus.DRAFT, notes: `Talepten olusturuldu: ${request.number}`, createdById: userId },
      });

      return po;
    });

    return c.json({ data: order }, 201);
  },

  async runReorderAutomation(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('user')?.id ?? 'system';

    const result = await prisma.$transaction(async (tx) => {
      const automation = new PurchaseAutomationService(tx);
      return automation.runReorderAutomation(tenantId, userId);
    });

    return c.json({ data: result }, result.createdRequest ? 201 : 200);
  },

  // -- Purchase Orders --------------------------

  async listOrders(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = parsePurchaseOrderList(c.req.query());
    if (!query) return c.json(new ValidationError('Satın alma siparişi filtreleri geçersiz.').toJSON(), 400);
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 20;
    const search = query.search?.trim();
    const minTotal = query.minTotal;
    const maxTotal = query.maxTotal;
    const dateWhere = query.dateFrom || query.dateTo
      ? {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        }
      : undefined;
    const dueWhere = query.dueFrom || query.dueTo
      ? {
          ...(query.dueFrom && { gte: new Date(query.dueFrom) }),
          ...(query.dueTo && { lte: new Date(query.dueTo) }),
        }
      : undefined;
    const totalWhere = Number.isFinite(minTotal) || Number.isFinite(maxTotal)
      ? {
          ...(Number.isFinite(minTotal) && { gte: minTotal }),
          ...(Number.isFinite(maxTotal) && { lte: maxTotal }),
        }
      : undefined;

    const where = {
      tenantId, deletedAt: null,
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' as const } },
          { notes: { contains: search, mode: 'insensitive' as const } },
          { contact: { name: { contains: search, mode: 'insensitive' as const } } },
          { contact: { code: { contains: search, mode: 'insensitive' as const } } },
          { items: { some: { product: { name: { contains: search, mode: 'insensitive' as const } } } } },
          { items: { some: { product: { code: { contains: search, mode: 'insensitive' as const } } } } },
        ],
      }),
      ...(query.status && { status: query.status as PurchaseOrderStatus }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(dateWhere && { date: dateWhere }),
      ...(dueWhere && { dueDate: dueWhere }),
      ...(totalWhere && { totalGross: totalWhere }),
    };

    const [total, orders] = await prisma.$transaction([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          contact: { select: { id: true, name: true, code: true } },
          items: {
            include: { product: { select: { id: true, code: true, name: true } } },
            orderBy: { sortOrder: 'asc' },
          },
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

    if (!order) return c.json(new NotFoundError('Satin alma siparisi', id).toJSON(), 404);
    const trace = await new PurchaseTraceService(prisma).getTrace(tenantId, order);
    return c.json({ data: { ...order, trace } });
  },

  async getOrderHistory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');

    const order = await prisma.purchaseOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!order) return c.json(new NotFoundError('Satin alma siparisi', id).toJSON(), 404);

    const history = await prisma.purchaseOrderHistory.findMany({
      where: { tenantId, orderId: id },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: history });
  },

  async getThreeWayMatch(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    try {
      const result = await new PurchaseThreeWayMatchService(prisma).evaluate(tenantId, id);
      return c.json({ data: result });
    } catch (error) {
      if (error instanceof NotFoundError) return c.json(error.toJSON(), 404);
      throw error;
    }
  },

  async createOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const { ipAddress, userAgent } = getRequestMeta(c);

    const body = parsePurchaseOrderCreate(await c.req.json<unknown>().catch(() => null));
    if (!body) return c.json(new ValidationError('Tedarikçi, geçerli tarihler ve geçerli sipariş kalemleri zorunludur.').toJSON(), 400);
    const [supplier, productCount] = await Promise.all([
      prisma.contact.findFirst({ where: { id: body.contactId, tenantId, deletedAt: null, isActive: true, type: { in: [ContactType.SUPPLIER, ContactType.BOTH] } }, select: { id: true } }),
      prisma.product.count({ where: { tenantId, id: { in: body.items.map((item) => item.productId) }, deletedAt: null, isActive: true } }),
    ]);
    if (!supplier) return c.json(new ValidationError('Seçilen tedarikçi bu tenant içinde bulunamadı veya satın almaya uygun değil.').toJSON(), 400);
    if (productCount !== body.items.length) return c.json(new ValidationError('Bir veya daha fazla ürün bu tenant içinde bulunamadı ya da aktif değil.').toJSON(), 400);

    const { lineData, totalNet, totalTax, totalGross } = computeItems(body.items);

    const order = await prisma.$transaction(async (tx) => {
      const number = await generateDocumentNumber(tenantId, 'purchase_order', 'PO-', 'purchaseOrder', tx);
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId, contactId: body.contactId, number,
          date: new Date(body.date),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          status: PurchaseOrderStatus.DRAFT,
          totalNet, totalTax, totalGross,
          notes: body.notes ?? null,
          createdById: userId,
          items: { create: lineData.map((l) => ({ tenantId, ...l })) },
        },
        include: {
          contact: { select: { id: true, name: true, code: true } },
          items: { include: { product: { select: { id: true, code: true, name: true } } } },
        },
      });

      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: po.id, toStatus: PurchaseOrderStatus.DRAFT, createdById: userId },
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
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${id}))`;
      const order = await tx.purchaseOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!order) throw new NotFoundError('Satın alma siparişi', id);
      if (order.status !== PurchaseOrderStatus.DRAFT) throw new ConflictError('Sadece taslak siparişler gönderilebilir.');
      const po = await tx.purchaseOrder.update({
        where: { id }, data: { status: PurchaseOrderStatus.SENT },
      });
      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: id, fromStatus: PurchaseOrderStatus.DRAFT, toStatus: PurchaseOrderStatus.SENT, createdById: userId },
      });
      return po;
    });

    return c.json({ data: updated });
  },

  async receiveOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const command = parseConfirmGoodsReceipt(id, await c.req.json<unknown>());
    const receivedOrder = await inventoryApplication.confirmGoodsReceipt.execute(
      { tenantId, userId },
      command,
    );
    return c.json({ data: receivedOrder });

  },

  async cancelOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${id}))`;
      const order = await tx.purchaseOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!order) throw new NotFoundError('Satın alma siparişi', id);
      if (order.status === PurchaseOrderStatus.RECEIVED || order.status === PurchaseOrderStatus.CANCELLED) throw new ConflictError('Teslim alınmış veya iptal edilmiş siparişler iptal edilemez.');
      const po = await tx.purchaseOrder.update({
        where: { id }, data: { status: PurchaseOrderStatus.CANCELLED },
      });
      await tx.purchaseOrderHistory.create({
        data: { tenantId, orderId: id, fromStatus: order.status, toStatus: PurchaseOrderStatus.CANCELLED, createdById: userId },
      });
      return po;
    });

    return c.json({ data: updated });
  },
};
