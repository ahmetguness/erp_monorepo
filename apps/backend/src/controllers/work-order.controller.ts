import { Context } from 'hono';
import { WorkOrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// Work Order Controller — İş emri CRUD + durum geçişleri
// ─────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const WorkOrderController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
    const status = c.req.query('status') as WorkOrderStatus | undefined;

    const where = { tenantId, deletedAt: null, ...(status && { status }) };

    const [total, data] = await prisma.$transaction([
      prisma.workOrder.count({ where }),
      prisma.workOrder.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          bom: { select: { id: true, name: true, version: true } },
          _count: { select: { items: true, operations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const wo = await prisma.workOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        product: { select: { id: true, code: true, name: true } },
        bom: { select: { id: true, name: true, version: true } },
        inputWarehouse: { select: { id: true, code: true, name: true } },
        outputWarehouse: { select: { id: true, code: true, name: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
        operations: {
          include: { workCenter: { select: { id: true, code: true, name: true } } },
          orderBy: { stepOrder: 'asc' },
        },
        history: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!wo) return c.json(new NotFoundError('İş Emri', id).toJSON(), 404);
    return c.json({ data: wo });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const body = await c.req.json<{
      productId: string; bomId?: string; plannedQty: number;
      startDate?: string; endDate?: string; notes?: string;
      inputWarehouseId?: string; outputWarehouseId?: string;
    }>();

    if (!body.productId || !body.plannedQty) return c.json(new ValidationError('productId ve plannedQty zorunludur.').toJSON(), 400);

    // Numara üret
    const seq = await prisma.numberSequence.upsert({
      where: { tenantId_module: { tenantId, module: 'work_order' } },
      create: { tenantId, module: 'work_order', prefix: 'WO-', lastNum: 1, padding: 6 },
      update: { lastNum: { increment: 1 } },
    });
    const number = `${seq.prefix}${String(seq.lastNum).padStart(seq.padding, '0')}`;

    // BOM varsa item ve operasyonları otomatik kopyala
    let itemsCreate: Array<{ tenantId: string; productId: string; requiredQty: number }> = [];
    let opsCreate: Array<{ tenantId: string; workCenterId: string; routingOpId: string; name: string; stepOrder: number }> = [];

    if (body.bomId) {
      const bom = await prisma.bOM.findFirst({
        where: { id: body.bomId, tenantId },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          routings: { orderBy: { stepOrder: 'asc' } },
        },
      });
      if (bom) {
        itemsCreate = bom.items.map((bi) => ({
          tenantId, productId: bi.productId,
          requiredQty: Number(bi.quantity) * body.plannedQty,
        }));
        opsCreate = bom.routings.map((r) => ({
          tenantId, workCenterId: r.workCenterId, routingOpId: r.id,
          name: r.name, stepOrder: r.stepOrder,
        }));
      }
    }

    const wo = await prisma.workOrder.create({
      data: {
        tenantId, productId: body.productId, bomId: body.bomId ?? null,
        number, plannedQty: body.plannedQty,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        notes: body.notes ?? null,
        inputWarehouseId: body.inputWarehouseId ?? null,
        outputWarehouseId: body.outputWarehouseId ?? null,
        ...(itemsCreate.length && { items: { create: itemsCreate } }),
        ...(opsCreate.length && { operations: { create: opsCreate } }),
        history: { create: { tenantId, toStatus: 'PLANNED' } },
      },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    return c.json({ data: wo }, 201);
  },

  async changeStatus(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const wo = await prisma.workOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!wo) return c.json(new NotFoundError('İş Emri', id).toJSON(), 404);

    const body = await c.req.json<{ status: WorkOrderStatus; notes?: string }>();
    if (!body.status) return c.json(new ValidationError('status zorunludur.').toJSON(), 400);

    const allowed = STATUS_TRANSITIONS[wo.status];
    if (!allowed.includes(body.status)) {
      return c.json(new ValidationError(`${wo.status} → ${body.status} geçişi yapılamaz.`).toJSON(), 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workOrder.update({
        where: { id },
        data: { status: body.status },
      });
      await tx.workOrderHistory.create({
        data: { tenantId, workOrderId: id, fromStatus: wo.status, toStatus: body.status, notes: body.notes ?? null },
      });

      // COMPLETED → stok hareketi: üretilen ürünü output warehouse'a ekle
      if (body.status === 'COMPLETED' && wo.outputWarehouseId && Number(wo.producedQty) > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId, productId: wo.productId, type: 'IN',
            quantity: wo.producedQty, toWarehouseId: wo.outputWarehouseId,
            refType: 'WORK_ORDER', refId: id, notes: `İş emri ${wo.number} üretim çıktısı`,
          },
        });
      }
      return result;
    });

    return c.json({ data: updated });
  },

  async reportProduction(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const wo = await prisma.workOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!wo) return c.json(new NotFoundError('İş Emri', id).toJSON(), 404);
    if (wo.status !== 'IN_PROGRESS') return c.json(new ValidationError('Üretim bildirimi sadece IN_PROGRESS durumunda yapılabilir.').toJSON(), 400);

    const body = await c.req.json<{ producedQty: number; consumptions?: Array<{ itemId: string; quantity: number }> }>();
    if (!body.producedQty || body.producedQty <= 0) return c.json(new ValidationError('producedQty pozitif olmalıdır.').toJSON(), 400);

    await prisma.$transaction(async (tx) => {
      // Üretim miktarını güncelle
      await tx.workOrder.update({
        where: { id },
        data: { producedQty: { increment: body.producedQty } },
      });

      // Malzeme tüketimlerini kaydet
      if (body.consumptions?.length) {
        for (const cons of body.consumptions) {
          const item = wo.items.find((i) => i.id === cons.itemId);
          if (!item) continue;

          await tx.workOrderItem.update({
            where: { id: cons.itemId },
            data: { consumedQty: { increment: cons.quantity } },
          });

          // Stok hareketi: malzeme çıkışı
          const warehouseId = item.sourceWarehouseId ?? wo.inputWarehouseId;
          if (warehouseId) {
            await tx.stockMovement.create({
              data: {
                tenantId, productId: item.productId, type: 'OUT',
                quantity: cons.quantity, fromWarehouseId: warehouseId,
                refType: 'WORK_ORDER', refId: id,
                notes: `İş emri ${wo.number} malzeme tüketimi`,
              },
            });
          }
        }
      }
    });

    const updated = await prisma.workOrder.findFirst({ where: { id }, select: { id: true, number: true, producedQty: true, plannedQty: true } });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const wo = await prisma.workOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!wo) return c.json(new NotFoundError('İş Emri', id).toJSON(), 404);
    if (wo.status === 'IN_PROGRESS') return c.json(new ValidationError('Devam eden iş emri silinemez.').toJSON(), 400);

    await prisma.workOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.json({ data: { success: true } });
  },
};
