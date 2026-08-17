import {
  MovementType,
  Prisma,
  PrismaClient,
  ReservationRefType,
  WorkOrderStatus,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { postProductionAccountingEntry } from './production-rules.service.js';
import { assertCanReserveStock } from './inventory-rules.service.js';

export interface ProductionDerivationResult {
  workOrderId: string;
  previousStatus: WorkOrderStatus;
  derivedStatus: WorkOrderStatus;
  plannedQty: number;
  producedQty: number;
  materialReservationCount: number;
  autoCompleted: boolean;
}

export interface AutoReserveResult {
  workOrderId: string;
  /** Number of items successfully reserved or updated. */
  reservedCount: number;
  /** Number of items skipped because available stock was insufficient. */
  skippedCount: number;
  /** Product IDs where stock was insufficient. */
  insufficientProductIds: string[];
}

export class ProductionAutomationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Automatically reserves all required raw materials for a Work Order.
   *
   * Performs an available-stock check (onHand − existing reservations) before
   * creating or updating each reservation so that race conditions or insufficient
   * inventory no longer silently produce over-reservations.
   *
   * Items where available stock < required quantity are skipped and reported in
   * the returned `insufficientProductIds` list — a partial reservation is
   * returned rather than throwing so callers can handle shortage gracefully.
   */
  async autoReserveWorkOrderMaterials(
    tenantId: string,
    workOrderId: string,
  ): Promise<AutoReserveResult> {
    const wo = await this.db.workOrder.findFirst({
      where: { id: workOrderId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!wo) {
      throw new Error(`İş Emri bulunamadı: ${workOrderId}`);
    }

    let reservedCount = 0;
    let skippedCount = 0;
    const insufficientProductIds: string[] = [];

    for (const item of wo.items) {
      const warehouseId = item.sourceWarehouseId ?? wo.inputWarehouseId;
      if (!warehouseId) continue;

      const remainingToReserve = Math.max(
        0,
        Number(item.requiredQty) - Number(item.consumedQty),
      );
      if (remainingToReserve <= 0) continue;

      // ── Stock availability check ────────────────────────────────────────
      // assertCanReserveStock computes (onHand − reserved) excluding the
      // existing reservation for this work order, so re-runs are idempotent.
      try {
        await assertCanReserveStock(this.db, tenantId, {
          productId: item.productId,
          warehouseId,
          quantity: remainingToReserve,
          refType: ReservationRefType.WORK_ORDER,
          refId: wo.id,
        });
      } catch {
        // Insufficient available stock — log and continue with next item
        logger.warn(
          `[ProductionAutomation] Insufficient stock for product ${item.productId} ` +
            `in warehouse ${warehouseId} for WorkOrder ${workOrderId}. ` +
            `Required: ${remainingToReserve}. Skipping.`,
        );
        insufficientProductIds.push(item.productId);
        skippedCount++;
        continue;
      }

      // ── Upsert reservation ──────────────────────────────────────────────
      const existingRes = await this.db.inventoryReservation.findFirst({
        where: {
          tenantId,
          refType: ReservationRefType.WORK_ORDER,
          refId: wo.id,
          productId: item.productId,
          warehouseId,
          releasedAt: null,
        },
      });

      if (existingRes) {
        await this.db.inventoryReservation.update({
          where: { id: existingRes.id },
          data: { quantity: new Prisma.Decimal(remainingToReserve) },
        });
      } else {
        await this.db.inventoryReservation.create({
          data: {
            tenantId,
            refType: ReservationRefType.WORK_ORDER,
            refId: wo.id,
            productId: item.productId,
            warehouseId,
            quantity: new Prisma.Decimal(remainingToReserve),
          },
        });
      }
      reservedCount++;
    }

    logger.info(
      `[ProductionAutomation] AutoReserve WorkOrder ${workOrderId}: ` +
        `reserved=${reservedCount}, skipped=${skippedCount}`,
    );

    return { workOrderId, reservedCount, skippedCount, insufficientProductIds };
  }

  /**
   * Derives WorkOrder status automatically based on production movements
   * PLANNED -> materials reserved
   * IN_PROGRESS -> materials consumed / production output started
   * COMPLETED -> producedQty >= plannedQty
   */
  async deriveStatusFromMovements(
    tenantId: string,
    workOrderId: string,
  ): Promise<ProductionDerivationResult> {
    const wo = await this.db.workOrder.findFirst({
      where: { id: workOrderId, tenantId, deletedAt: null },
      include: {
        items: true,
        operations: true,
      },
    });

    if (!wo) {
      throw new Error(`İş Emri bulunamadı: ${workOrderId}`);
    }

    const previousStatus = wo.status;
    const plannedQty = Number(wo.plannedQty);
    const producedQty = Number(wo.producedQty);
    const anyConsumed = wo.items.some((i) => Number(i.consumedQty) > 0);

    let derivedStatus: WorkOrderStatus = wo.status;
    let autoCompleted = false;

    // Derivation Logic:
    if (producedQty >= plannedQty && plannedQty > 0) {
      derivedStatus = WorkOrderStatus.COMPLETED;
    } else if (producedQty > 0 || anyConsumed) {
      derivedStatus = WorkOrderStatus.IN_PROGRESS;
    } else if (wo.status === WorkOrderStatus.PLANNED) {
      derivedStatus = WorkOrderStatus.PLANNED;
    }

    // Auto Reserve Materials if in PLANNED
    const reservationRes = await this.autoReserveWorkOrderMaterials(tenantId, workOrderId);

    // If status transitioned to COMPLETED
    if (derivedStatus === WorkOrderStatus.COMPLETED && previousStatus !== WorkOrderStatus.COMPLETED) {
      await this.autoCompleteProduction(tenantId, workOrderId);
      autoCompleted = true;
    } else if (derivedStatus !== previousStatus) {
      await this.db.workOrder.update({
        where: { id: workOrderId },
        data: { status: derivedStatus },
      });

      await this.db.workOrderHistory.create({
        data: {
          tenantId,
          workOrderId,
          fromStatus: previousStatus,
          toStatus: derivedStatus,
          notes: `Durum hareketlerden otomatik türetildi (${previousStatus} -> ${derivedStatus}).`,
        },
      });
    }

    return {
      workOrderId,
      previousStatus,
      derivedStatus,
      plannedQty,
      producedQty,
      materialReservationCount: reservationRes.reservedCount,
      autoCompleted,
    };
  }

  /**
   * Auto Completes Production:
   * 1. Output finished product to warehouse
   * 2. Release material reservations
   * 3. Post accounting entries
   */
  async autoCompleteProduction(
    tenantId: string,
    workOrderId: string,
    finalOutputQty?: number,
  ): Promise<{ workOrderId: string; status: WorkOrderStatus }> {
    const wo = await this.db.workOrder.findFirst({
      where: { id: workOrderId, tenantId, deletedAt: null },
      include: { product: true },
    });

    if (!wo) {
      throw new Error(`İş Emri bulunamadı: ${workOrderId}`);
    }

    const outputQty = finalOutputQty !== undefined && Number.isFinite(finalOutputQty) ? finalOutputQty : Number(wo.plannedQty);

    await this.db.$transaction(async (tx) => {
      const targetWo = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
      });
      if (!targetWo) {
        throw new Error(`İş Emri bulunamadı: ${workOrderId}`);
      }

      // 1. Update WorkOrder status & producedQty
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          status: WorkOrderStatus.COMPLETED,
          producedQty: new Prisma.Decimal(outputQty),
          endDate: new Date(),
        },
      });

      // 2. Release Material Reservations
      await tx.inventoryReservation.updateMany({
        where: {
          tenantId,
          refType: ReservationRefType.WORK_ORDER,
          refId: workOrderId,
          releasedAt: null,
        },
        data: { releasedAt: new Date() },
      });

      // 3. Post Finished Goods Stock Entry if output warehouse defined
      if (wo.outputWarehouseId) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: wo.productId,
            toWarehouseId: wo.outputWarehouseId,
            type: MovementType.IN,
            quantity: new Prisma.Decimal(outputQty),
            unitCost: wo.product.averageCost ?? new Prisma.Decimal(0),
            totalCost: new Prisma.Decimal(outputQty * Number(wo.product.averageCost ?? 0)),
            notes: `Üretim çıktısı — İş Emri: ${wo.number}`,
          },
        });
      }

      // 4. Record History
      await tx.workOrderHistory.create({
        data: {
          tenantId,
          workOrderId,
          fromStatus: wo.status,
          toStatus: WorkOrderStatus.COMPLETED,
          notes: 'Üretim otomasyonu ile tamamlandı.',
        },
      });

      // 5. Post Production Accounting Entry
      await postProductionAccountingEntry(tx, tenantId, workOrderId, wo.createdById || 'SYSTEM');
    });

    logger.info(`[ProductionAutomation] Auto-completed production for WorkOrder ${workOrderId}`);
    return { workOrderId, status: WorkOrderStatus.COMPLETED };
  }
}
