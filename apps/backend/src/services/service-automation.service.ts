import {
  InvoiceType,
  MovementType,
  Prisma,
  PrismaClient,
  ReservationRefType,
  ServiceStatus,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { EDocumentAutomationService } from './edocument-automation.service.js';
import { assertCanReserveStock, lockInventoryPosition } from './inventory-rules.service.js';

export interface ServiceAutomationResult {
  serviceRequestId: string;
  status: ServiceStatus;
  invoiceId?: string;
  invoiceNumber?: string;
  eDocumentCreated?: boolean;
}

export class ServiceAutomationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Pipeline Step 1: Assign Technician to Service Request
   * Transitions status from OPEN to IN_PROGRESS
   */
  async assignTechnician(
    tenantId: string,
    serviceRequestId: string,
    technicianId: string,
  ): Promise<{ serviceRequestId: string; assignedToId: string; status: ServiceStatus }> {
    const sr = await this.db.serviceRequest.findFirst({
      where: { id: serviceRequestId, tenantId, deletedAt: null },
    });

    if (!sr) throw new Error(`Servis Talebi bulunamadı: ${serviceRequestId}`);

    const updated = await this.db.serviceRequest.update({
      where: { id: serviceRequestId },
      data: {
        assignedToId: technicianId,
        status: ServiceStatus.IN_PROGRESS,
      },
    });

    await this.db.serviceRequestHistory.create({
      data: {
        tenantId,
        serviceRequestId,
        fromStatus: sr.status,
        toStatus: ServiceStatus.IN_PROGRESS,
        notes: `Teknisyen atandı (ID: ${technicianId}).`,
      },
    });

    logger.info(`[ServiceAutomation] Assigned technician ${technicianId} to ServiceRequest ${serviceRequestId}`);
    return {
      serviceRequestId,
      assignedToId: technicianId,
      status: updated.status,
    };
  }

  /**
   * Pipeline Step 2: Reserve Service Parts (Yedek Parça Stok Rezervasyonu)
   */
  async reserveServiceParts(
    tenantId: string,
    serviceRequestId: string,
    warehouseId: string,
  ): Promise<{ serviceRequestId: string; reservedItemCount: number }> {
    const sr = await this.db.serviceRequest.findFirst({
      where: { id: serviceRequestId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!sr) throw new Error(`Servis Talebi bulunamadı: ${serviceRequestId}`);

    const warehouse = await this.db.warehouse.findFirst({ where: { id: warehouseId, tenantId } });
    if (!warehouse) throw new NotFoundError('Depo', warehouseId);

    const requiredByProduct = new Map<string, number>();
    for (const item of sr.items) {
      if (!item.productId) continue;
      const quantity = Number(item.quantity);
      if (quantity > 0) requiredByProduct.set(item.productId, (requiredByProduct.get(item.productId) ?? 0) + quantity);
    }
    const productIds = [...requiredByProduct.keys()].sort();
    const ownedProductCount = await this.db.product.count({ where: { id: { in: productIds }, tenantId, deletedAt: null } });
    if (ownedProductCount !== productIds.length) throw new NotFoundError('Servis parcasi');

    const reservedItemCount = await this.db.$transaction(async (tx) => {
      let count = 0;
      for (const productId of productIds) {
        const requiredQuantity = requiredByProduct.get(productId) ?? 0;
        await lockInventoryPosition(tx, tenantId, productId, warehouseId);
        const active = await tx.inventoryReservation.findMany({
          where: {
            tenantId,
            refType: ReservationRefType.OTHER,
            refId: sr.id,
            productId,
            warehouseId,
            releasedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { reservedAt: 'asc' },
        });
        const alreadyReserved = active.reduce((sum, row) => sum + Number(row.quantity), 0);
        const remaining = Math.max(0, requiredQuantity - alreadyReserved);
        if (active[0]) {
          if (remaining > 0) await assertCanReserveStock(tx, tenantId, { productId, warehouseId, quantity: remaining, refType: ReservationRefType.OTHER, refId: sr.id });
          await tx.inventoryReservation.update({ where: { id: active[0].id }, data: { quantity: new Prisma.Decimal(requiredQuantity) } });
          if (active.length > 1) await tx.inventoryReservation.updateMany({ where: { id: { in: active.slice(1).map((row) => row.id) } }, data: { releasedAt: new Date() } });
        } else {
          await assertCanReserveStock(tx, tenantId, { productId, warehouseId, quantity: requiredQuantity, refType: ReservationRefType.OTHER, refId: sr.id });
          await tx.inventoryReservation.create({ data: { tenantId, refType: ReservationRefType.OTHER, refId: sr.id, productId, warehouseId, quantity: new Prisma.Decimal(requiredQuantity) } });
        }
        count++;
      }
      await tx.serviceRequest.update({ where: { id: serviceRequestId }, data: { status: ServiceStatus.WAITING_PARTS } });
      return count;
    });

    logger.info(`[ServiceAutomation] Reserved ${reservedItemCount} parts for ServiceRequest ${serviceRequestId}`);
    return { serviceRequestId, reservedItemCount };
  }

  /**
   * Pipeline Step 3 & 4: Complete Service & Auto-Generate Invoice & Trigger E-Document
   */
  async completeServiceAndGenerateInvoice(
    tenantId: string,
    serviceRequestId: string,
    warehouseId?: string,
  ): Promise<ServiceAutomationResult> {
    const sr = await this.db.serviceRequest.findFirst({
      where: { id: serviceRequestId, tenantId, deletedAt: null },
      include: {
        contact: true,
        items: { include: { product: true } },
      },
    });

    if (!sr) throw new Error(`Servis Talebi bulunamadı: ${serviceRequestId}`);
    if (!sr.contactId) {
      throw new Error(`Servis talebi için cari müşteri tanımlı değil.`);
    }

    if (warehouseId) {
      const warehouse = await this.db.warehouse.findFirst({ where: { id: warehouseId, tenantId, isActive: true }, select: { id: true } });
      if (!warehouse) throw new NotFoundError('Depo', warehouseId);
    }

    let invoiceId: string | undefined;
    let invoiceNumber: string | undefined;
    let eDocumentCreated = false;

    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${serviceRequestId}))`;
      const targetSr = await tx.serviceRequest.findFirst({
        where: { id: serviceRequestId, tenantId },
      });
      if (!targetSr) {
        throw new Error(`Servis Talebi bulunamadı: ${serviceRequestId}`);
      }

      if (targetSr.status === ServiceStatus.COMPLETED || targetSr.status === ServiceStatus.CANCELLED) throw new ConflictError('Servis talebi zaten terminal durumda; tekrar fatura olusturulamaz.');

      // 1. Update Service Request Status to COMPLETED
      await tx.serviceRequest.update({
        where: { id: serviceRequestId },
        data: {
          status: ServiceStatus.COMPLETED,
          closedAt: new Date(),
        },
      });

      // 2. Release Stock Reservations & Deduct Stock Movement
      await tx.inventoryReservation.updateMany({
        where: {
          tenantId,
          refType: ReservationRefType.OTHER,
          refId: serviceRequestId,
          releasedAt: null,
        },
        data: { releasedAt: new Date() },
      });

      if (warehouseId) {
        for (const item of sr.items) {
          if (!item.productId) continue;
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              fromWarehouseId: warehouseId,
              type: MovementType.OUT,
              quantity: item.quantity,
              unitCost: item.unitPrice,
              totalCost: item.lineTotal,
              notes: `Teknik Servis Parça Kullanımı — Servis No: ${sr.number}`,
            },
          });
        }
      }

      // 3. Generate Draft Invoice for Customer
      const invNumber = await generateDocumentNumber(tenantId, 'invoice', 'INV-', 'invoice');
      invoiceNumber = invNumber;

      const totalNet = sr.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
      const totalTax = totalNet * 0.20; // 20% KDV default
      const totalGross = totalNet + totalTax;

      const newInvoice = await tx.invoice.create({
        data: {
          tenantId,
          contactId: sr.contactId!,
          type: InvoiceType.SALES,
          status: 'DRAFT',
          number: invNumber,
          date: new Date(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 days
          notes: `Servis Talebi ${sr.number} (${sr.subject}) kapsamında otomatik üretildi.`,
          totalNet: new Prisma.Decimal(totalNet),
          totalTax: new Prisma.Decimal(totalTax),
          totalGross: new Prisma.Decimal(totalGross),
          lines: {
            create: sr.items.map((item, idx) => ({
              tenantId,
              productId: item.productId,
              description: item.description || item.product?.name || 'Servis Parça/İşçilik Kalemi',
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              taxAmount: new Prisma.Decimal(Number(item.lineTotal) * 0.20),
              lineTotal: item.lineTotal,
              sortOrder: idx + 1,
            })),
          },
        },
      });

      invoiceId = newInvoice.id;

      // 4. Record History
      await tx.serviceRequestHistory.create({
        data: {
          tenantId,
          serviceRequestId,
          fromStatus: sr.status,
          toStatus: ServiceStatus.COMPLETED,
          notes: `Servis tamamlandı ve Otomatik Fatura ürettirildi (${invNumber}).`,
        },
      });
    });

    // 5. Trigger Phase 13 E-Document Auto Creation
    if (invoiceId) {
      try {
        const eDocAutomation = new EDocumentAutomationService(this.db);
        await eDocAutomation.autoCreateAndSendEDocument(tenantId, invoiceId);
        eDocumentCreated = true;
      } catch (err) {
        logger.error(`[ServiceAutomation] E-Document auto creation error for invoice ${invoiceId}: ${err}`);
      }
    }

    logger.info(`[ServiceAutomation] Completed ServiceRequest ${serviceRequestId}, generated invoice ${invoiceNumber}`);
    return {
      serviceRequestId,
      status: ServiceStatus.COMPLETED,
      invoiceId,
      invoiceNumber,
      eDocumentCreated,
    };
  }
}
