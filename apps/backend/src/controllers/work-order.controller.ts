import { Context } from 'hono';
import { AuditAction, EntityType, MovementType, ReservationRefType, WorkOrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { createEventContext, domainEvents } from '../domain-events';
import {
  assertCanConsumeStock,
  assertCanReserveStock,
  recordInventoryCosting,
  resolveStockLevelLocationId,
} from '../services/inventory-rules.service';
import {
  calculateEstimatedCosts,
  allocateCapacity,
  releaseCapacity,
  postProductionAccountingEntry,
} from '../services/production-rules.service.js';

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

interface MaterialRequirement {
  productId: string;
  warehouseId: string;
  quantity: number;
}

interface ReservationResult {
  reservedLineCount: number;
  reservedQuantity: number;
}

function requirePositiveQuantity(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} pozitif olmalıdır.`);
  }
}

function materialRequirementKey(productId: string, warehouseId: string): string {
  return `${productId}:${warehouseId}`;
}

function buildMaterialRequirements(
  items: Array<{ productId: string; requiredQty: unknown; consumedQty: unknown; sourceWarehouseId: string | null }>,
  inputWarehouseId: string | null,
): MaterialRequirement[] {
  const requirements = new Map<string, MaterialRequirement>();

  for (const item of items) {
    const warehouseId = item.sourceWarehouseId ?? inputWarehouseId;
    if (!warehouseId) continue;
    const remainingQty = Math.max(0, Number(item.requiredQty ?? 0) - Number(item.consumedQty ?? 0));
    if (remainingQty <= 0) continue;

    const key = materialRequirementKey(item.productId, warehouseId);
    const current = requirements.get(key);
    if (current) {
      current.quantity += remainingQty;
    } else {
      requirements.set(key, { productId: item.productId, warehouseId, quantity: remainingQty });
    }
  }

  return Array.from(requirements.values());
}

export const WorkOrderController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
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
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const wo = await prisma.workOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        product: { select: { id: true, code: true, name: true, purchasePrice: true, averageCost: true } },
        bom: { select: { id: true, name: true, version: true } },
        inputWarehouse: { select: { id: true, code: true, name: true } },
        outputWarehouse: { select: { id: true, code: true, name: true } },
        items: { include: { product: { select: { id: true, code: true, name: true, purchasePrice: true, averageCost: true } } } },
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
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const requestMeta = getRequestMeta(c);

    const body = await c.req.json<{
      productId: string; bomId?: string; plannedQty: number;
      startDate?: string; endDate?: string; notes?: string;
      inputWarehouseId?: string; outputWarehouseId?: string;
    }>();

    if (!body.productId || !body.plannedQty) return c.json(new ValidationError('productId ve plannedQty zorunludur.').toJSON(), 400);

    // Numara üret
    const number = await generateDocumentNumber(tenantId, 'work_order', 'WO-', 'workOrder');

    // BOM varsa item ve operasyonları otomatik kopyala
    let itemsCreate: Array<{ tenantId: string; productId: string; requiredQty: number }> = [];
    let opsCreate: Array<{ tenantId: string; workCenterId: string; routingOpId: string; name: string; stepOrder: number; plannedSetupTime: number | null; plannedRunTime: number | null }> = [];
    let estimatedMaterialCost = 0;
    let estimatedLaborCost = 0;
    let estimatedOverheadCost = 0;

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
          plannedSetupTime: r.setupTime ? Number(r.setupTime) : null,
          plannedRunTime: r.runTime ? Number(r.runTime) : null,
        }));

        try {
          const estimates = await calculateEstimatedCosts(prisma, tenantId, body.bomId, body.plannedQty);
          estimatedMaterialCost = estimates.estimatedMaterialCost;
          estimatedLaborCost = estimates.estimatedLaborCost;
          estimatedOverheadCost = estimates.estimatedOverheadCost;
        } catch (e) {
          // Keep defaults if estimation fails
        }
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
        estimatedMaterialCost,
        estimatedLaborCost,
        estimatedOverheadCost,
        createdById: userId,
        ...(itemsCreate.length && { items: { create: itemsCreate } }),
        ...(opsCreate.length && { operations: { create: opsCreate } }),
        history: { create: { tenantId, toStatus: 'PLANNED', createdById: userId } },
      },
      include: { product: { select: { id: true, code: true, name: true } } },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'production',
      entityType: EntityType.WORK_ORDER,
      entityId: wo.id,
      action: AuditAction.CREATE,
      newValues: { id: wo.id, number: wo.number, status: wo.status, plannedQty: Number(wo.plannedQty) },
      ...requestMeta,
    });

    return c.json({ data: wo }, 201);
  },

  async changeStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const requestMeta = getRequestMeta(c);
    const id = c.req.param('id')!;

    const wo = await prisma.workOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        product: { select: { id: true, name: true } },
        items: { select: { productId: true, requiredQty: true, consumedQty: true, sourceWarehouseId: true } },
      },
    });
    if (!wo) return c.json(new NotFoundError('İş Emri', id).toJSON(), 404);

    const body = await c.req.json<{ status: WorkOrderStatus; notes?: string }>();
    if (!body.status) return c.json(new ValidationError('status zorunludur.').toJSON(), 400);

    const allowed = STATUS_TRANSITIONS[wo.status];
    if (!allowed.includes(body.status)) {
      return c.json(new ValidationError(`${wo.status} → ${body.status} geçişi yapılamaz.`).toJSON(), 400);
    }

    const reservationEvents: ReservationResult[] = [];
    const completionEvents: Array<{
      productId: string;
      productName: string;
      plannedQty: number;
      producedQty: number;
      scrapQty: number;
    }> = [];

    const updated = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.workOrder.updateMany({
        where: { id, tenantId },
        data: { status: body.status },
      });
      if (updateResult.count !== 1) throw new NotFoundError('İş Emri', id);
      await tx.workOrderHistory.create({
        data: { tenantId, workOrderId: id, fromStatus: wo.status, toStatus: body.status, notes: body.notes ?? null, createdById: userId },
      });

      if (body.status === 'IN_PROGRESS') {
        const requirements = buildMaterialRequirements(wo.items, wo.inputWarehouseId);
        let reservedLineCount = 0;
        let reservedQuantity = 0;

        for (const requirement of requirements) {
          const existingReservation = await tx.inventoryReservation.aggregate({
            where: {
              tenantId,
              productId: requirement.productId,
              warehouseId: requirement.warehouseId,
              refType: ReservationRefType.WORK_ORDER,
              refId: id,
              releasedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            _sum: { quantity: true },
          });
          const existingQuantity = Number(existingReservation._sum.quantity ?? 0);
          const missingQuantity = Math.max(0, requirement.quantity - existingQuantity);
          if (missingQuantity <= 0) continue;

          await assertCanReserveStock(tx, tenantId, {
            productId: requirement.productId,
            warehouseId: requirement.warehouseId,
            quantity: missingQuantity,
            refType: ReservationRefType.WORK_ORDER,
            refId: id,
          });
          await tx.inventoryReservation.create({
            data: {
              tenantId,
              productId: requirement.productId,
              warehouseId: requirement.warehouseId,
              quantity: missingQuantity,
              refType: ReservationRefType.WORK_ORDER,
              refId: id,
              notes: `Work order ${wo.number} material reservation`,
              createdById: userId,
            },
          });
          reservedLineCount += 1;
          reservedQuantity += missingQuantity;
        }

        if (reservedLineCount > 0) {
          reservationEvents.push({ reservedLineCount, reservedQuantity });
        }

        // Allocate capacity on Work Center Calendar
        await allocateCapacity(tx, tenantId, id);
      }

      // COMPLETED → stok hareketi: üretilen ürünü output warehouse'a ekle
      if (body.status === 'COMPLETED' && wo.outputWarehouseId && Number(wo.producedQty) > 0) {
        const existingLevel = await tx.stockLevel.findFirst({
          where: { tenantId, productId: wo.productId, warehouseId: wo.outputWarehouseId },
        });
        const previousQuantity = Number(existingLevel?.quantity ?? 0);
        const locationId = await resolveStockLevelLocationId(tx, tenantId, wo.outputWarehouseId, existingLevel?.locationId);
        const stockMovement = await tx.stockMovement.create({
          data: {
            tenantId, productId: wo.productId, type: MovementType.IN,
            quantity: wo.producedQty, toWarehouseId: wo.outputWarehouseId,
            refType: 'WORK_ORDER', refId: id, notes: `İş emri ${wo.number} üretim çıktısı`,
          },
        });
        const producedQuantity = Number(wo.producedQty);
        await tx.stockLevel.upsert({
          where: {
            productId_warehouseId_locationId: {
              productId: wo.productId,
              warehouseId: wo.outputWarehouseId,
              locationId,
            },
          },
          create: {
            tenantId,
            productId: wo.productId,
            warehouseId: wo.outputWarehouseId,
            locationId,
            quantity: wo.producedQty,
          },
          update: { quantity: { increment: wo.producedQty } },
        });
        await recordInventoryCosting(tx, tenantId, {
          movementId: stockMovement.id,
          productId: wo.productId,
          warehouseId: wo.outputWarehouseId,
          type: MovementType.IN,
          quantity: producedQuantity,
          previousQuantity,
          quantityChange: producedQuantity,
          resultingQuantity: previousQuantity + producedQuantity,
          date: stockMovement.createdAt,
        });
        completionEvents.push({
          productId: wo.productId,
          productName: wo.product.name,
          plannedQty: Number(wo.plannedQty),
          producedQty: producedQuantity,
          scrapQty: 0,
        });
      }

      if (body.status === 'COMPLETED' || body.status === 'CANCELLED') {
        await tx.inventoryReservation.updateMany({
          where: { tenantId, refType: ReservationRefType.WORK_ORDER, refId: id, releasedAt: null },
          data: { releasedAt: new Date() },
        });

        // Release capacity on Work Center Calendar
        await releaseCapacity(tx, tenantId, id);

        // Generate journal entry on Work Order completion
        if (body.status === 'COMPLETED') {
          await postProductionAccountingEntry(tx, tenantId, id, userId);
        }
      }
      const result = await tx.workOrder.findFirst({ where: { id, tenantId } });
      if (!result) throw new NotFoundError('İş Emri', id);
      return result;
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'production',
      entityType: EntityType.WORK_ORDER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: { status: wo.status },
      newValues: { status: body.status, notes: body.notes ?? null },
      ...requestMeta,
    });

    for (const reservationResult of reservationEvents) {
      await domainEvents.publish({
        name: 'production.materialReserved',
        context: createEventContext({ tenantId, userId }),
        payload: {
          workOrderId: id,
          workOrderNumber: wo.number,
          reservedLineCount: reservationResult.reservedLineCount,
          reservedQuantity: reservationResult.reservedQuantity,
        },
      });
    }

    for (const completionPayload of completionEvents) {
      await domainEvents.publish({
        name: 'production.completed',
        context: createEventContext({ tenantId, userId }),
        payload: {
          workOrderId: id,
          workOrderNumber: wo.number,
          ...completionPayload,
        },
      });
    }

    return c.json({ data: updated });
  },

  async reportProduction(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const requestMeta = getRequestMeta(c);
    const id = c.req.param('id')!;

    const wo = await prisma.workOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        product: { select: { id: true, name: true, averageCost: true, purchasePrice: true } },
        items: true,
      },
    });
    if (!wo) return c.json(new NotFoundError('İş Emri', id).toJSON(), 404);
    if (wo.status !== 'IN_PROGRESS') return c.json(new ValidationError('Üretim bildirimi sadece IN_PROGRESS durumunda yapılabilir.').toJSON(), 400);

    const body = await c.req.json<{
      producedQty: number;
      scrapQty?: number;
      scrapReason?: string;
      operationId?: string;
      notes?: string;
      consumptions?: Array<{ itemId: string; quantity: number }>;
    }>();

    try {
      requirePositiveQuantity(body.producedQty, 'producedQty');
      if (body.scrapQty !== undefined && body.scrapQty < 0) throw new ValidationError('scrapQty negatif olamaz.');
      for (const cons of body.consumptions ?? []) {
        requirePositiveQuantity(cons.quantity, 'consumption.quantity');
      }
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }

    if (body.consumptions?.length) {
      for (const cons of body.consumptions) {
        const item = wo.items.find((i) => i.id === cons.itemId);
        if (!item) continue;
        const warehouseId = item.sourceWarehouseId ?? wo.inputWarehouseId;
        if (!warehouseId) continue;
        await assertCanConsumeStock(prisma, tenantId, {
          productId: item.productId,
          warehouseId,
          quantity: cons.quantity,
          refType: 'WORK_ORDER',
          refId: id,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Material Cost Calculation based on consumptions
      let consumedCost = 0;
      if (body.consumptions?.length) {
        for (const cons of body.consumptions) {
          const item = wo.items.find((i) => i.id === cons.itemId);
          if (!item) continue;
          const prod = await tx.product.findUnique({
            where: { id: item.productId },
            select: { averageCost: true, purchasePrice: true }
          });
          const unitC = Number(prod?.averageCost ?? prod?.purchasePrice ?? 0);
          consumedCost += cons.quantity * unitC;
        }
      }

      // 2. Labor & Overhead Cost Calculation for the reported operation
      let laborCost = 0;
      let overheadCost = 0;
      if (body.operationId) {
        const op = await tx.workOrderOperation.findFirst({
          where: { id: body.operationId, tenantId, workOrderId: id },
          include: { workCenter: true }
        });
        if (op) {
          const start = op.actualStartAt ? new Date(op.actualStartAt) : new Date();
          const end = new Date();
          let diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          if (diffHours <= 0) {
            const setup = Number(op.plannedSetupTime ?? 0);
            const run = Number(op.plannedRunTime ?? 0);
            diffHours = (setup + run * body.producedQty) / 60;
          }
          laborCost = diffHours * Number(op.workCenter.laborRate ?? 0);
          overheadCost = diffHours * Number(op.workCenter.overheadRate ?? 0);
        }
      }

      // 3. Scrap Cost Calculation
      let scrapCost = 0;
      if (body.scrapQty && body.scrapQty > 0) {
        const unitC = Number(wo.product.averageCost ?? wo.product.purchasePrice ?? 0);
        scrapCost = body.scrapQty * unitC;
      }

      // Update producedQty and costing fields
      const updateResult = await tx.workOrder.updateMany({
        where: { id, tenantId },
        data: {
          producedQty: { increment: body.producedQty },
          actualMaterialCost: { increment: consumedCost },
          actualLaborCost: { increment: laborCost },
          actualOverheadCost: { increment: overheadCost },
          ...(body.scrapQty && {
            scrapQty: { increment: body.scrapQty },
            scrapCost: { increment: scrapCost },
            scrapReason: body.scrapReason ?? null
          })
        },
      });
      if (updateResult.count !== 1) throw new NotFoundError('İş Emri', id);

      if (body.operationId) {
        await tx.workOrderOperation.updateMany({
          where: { id: body.operationId, tenantId, workOrderId: id },
          data: { status: WorkOrderStatus.COMPLETED, actualEndAt: new Date(), notes: body.notes ?? undefined },
        });
      }

      // Malzeme tüketimlerini kaydet
      if (body.consumptions?.length) {
        for (const cons of body.consumptions) {
          const item = wo.items.find((i) => i.id === cons.itemId);
          if (!item) continue;

          await tx.workOrderItem.updateMany({
            where: { id: cons.itemId, tenantId, workOrderId: id },
            data: { consumedQty: { increment: cons.quantity } },
          });

          // Stok hareketi: malzeme çıkışı
          const warehouseId = item.sourceWarehouseId ?? wo.inputWarehouseId;
          if (warehouseId) {
            const existingLevel = await tx.stockLevel.findFirst({
              where: { tenantId, productId: item.productId, warehouseId },
            });
            const previousQuantity = Number(existingLevel?.quantity ?? 0);
            const locationId = await resolveStockLevelLocationId(tx, tenantId, warehouseId, existingLevel?.locationId);
            const stockMovement = await tx.stockMovement.create({
              data: {
                tenantId, productId: item.productId, type: MovementType.OUT,
                quantity: cons.quantity, fromWarehouseId: warehouseId,
                refType: 'WORK_ORDER', refId: id,
                notes: `İş emri ${wo.number} malzeme tüketimi`,
              },
            });
            await tx.stockLevel.upsert({
              where: {
                productId_warehouseId_locationId: {
                  productId: item.productId,
                  warehouseId,
                  locationId,
                },
              },
              create: {
                tenantId,
                productId: item.productId,
                warehouseId,
                locationId,
                quantity: -cons.quantity,
              },
              update: { quantity: { decrement: cons.quantity } },
            });
            await recordInventoryCosting(tx, tenantId, {
              movementId: stockMovement.id,
              productId: item.productId,
              warehouseId,
              type: MovementType.OUT,
              quantity: cons.quantity,
              previousQuantity,
              quantityChange: -cons.quantity,
              resultingQuantity: previousQuantity - cons.quantity,
              date: stockMovement.createdAt,
            });
          }
        }
      }

      if ((body.scrapQty ?? 0) > 0 || body.notes) {
        await tx.workOrderHistory.create({
          data: {
            tenantId,
            workOrderId: id,
            fromStatus: wo.status,
            toStatus: wo.status,
            notes: [
              body.scrapQty ? `Fire: ${body.scrapQty}` : null,
              body.notes ?? null,
            ].filter((note): note is string => Boolean(note)).join(' | '),
            createdById: userId,
          },
        });
      }
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'production',
      entityType: EntityType.WORK_ORDER,
      entityId: id,
      action: AuditAction.UPDATE,
      newValues: {
        producedQty: body.producedQty,
        scrapQty: body.scrapQty ?? 0,
        scrapReason: body.scrapReason ?? null,
        operationId: body.operationId ?? null,
        consumptionCount: body.consumptions?.length ?? 0,
      },
      ...requestMeta,
    });

    const updated = await prisma.workOrder.findFirst({ where: { id, tenantId }, select: { id: true, number: true, producedQty: true, plannedQty: true } });
    return c.json({ data: updated });
  },

  async updateOperation(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const requestMeta = getRequestMeta(c);
    const workOrderId = c.req.param('id')!;
    const operationId = c.req.param('operationId')!;

    const body = await c.req.json<{
      status?: WorkOrderStatus;
      actualStartAt?: string | null;
      actualEndAt?: string | null;
      notes?: string | null;
    }>();

    const operation = await prisma.workOrderOperation.findFirst({
      where: { id: operationId, tenantId, workOrderId, workOrder: { tenantId, deletedAt: null } },
      select: { id: true, status: true, actualStartAt: true, actualEndAt: true, name: true },
    });
    if (!operation) return c.json(new NotFoundError('Operasyon', operationId).toJSON(), 404);

    const nextStatus = body.status ?? operation.status;
    const actualStartAt = body.actualStartAt === undefined
      ? (nextStatus === WorkOrderStatus.IN_PROGRESS && !operation.actualStartAt ? new Date() : undefined)
      : body.actualStartAt === null ? null : new Date(body.actualStartAt);
    const actualEndAt = body.actualEndAt === undefined
      ? (nextStatus === WorkOrderStatus.COMPLETED && !operation.actualEndAt ? new Date() : undefined)
      : body.actualEndAt === null ? null : new Date(body.actualEndAt);

    const updated = await prisma.workOrderOperation.update({
      where: { id: operationId },
      data: {
        status: nextStatus,
        ...(actualStartAt !== undefined ? { actualStartAt } : {}),
        ...(actualEndAt !== undefined ? { actualEndAt } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'production',
      entityType: EntityType.WORK_ORDER,
      entityId: workOrderId,
      action: AuditAction.UPDATE,
      oldValues: { operationId, status: operation.status },
      newValues: { operationId, status: updated.status, notes: updated.notes ?? null },
      ...requestMeta,
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const wo = await prisma.workOrder.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!wo) return c.json(new NotFoundError('İş Emri', id).toJSON(), 404);
    if (wo.status === 'IN_PROGRESS') return c.json(new ValidationError('Devam eden iş emri silinemez.').toJSON(), 400);

    await prisma.workOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.json({ data: { success: true } });
  },
};
