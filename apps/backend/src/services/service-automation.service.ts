import {
  InvoiceType,
  MovementType,
  Prisma,
  PrismaClient,
  ReservationRefType,
  ServiceStatus,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { EDocumentAutomationService } from './edocument-automation.service.js';

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

    let reservedItemCount = 0;

    for (const item of sr.items) {
      if (!item.productId) continue;

      const qty = Number(item.quantity);
      if (qty <= 0) continue;

      const existing = await this.db.inventoryReservation.findFirst({
        where: {
          tenantId,
          refType: ReservationRefType.OTHER,
          refId: sr.id,
          productId: item.productId,
          warehouseId,
          releasedAt: null,
        },
      });

      if (existing) {
        await this.db.inventoryReservation.update({
          where: { id: existing.id },
          data: { quantity: new Prisma.Decimal(qty) },
        });
      } else {
        await this.db.inventoryReservation.create({
          data: {
            tenantId,
            refType: ReservationRefType.OTHER,
            refId: sr.id,
            productId: item.productId,
            warehouseId,
            quantity: new Prisma.Decimal(qty),
          },
        });
      }
      reservedItemCount++;
    }

    await this.db.serviceRequest.update({
      where: { id: serviceRequestId },
      data: { status: ServiceStatus.WAITING_PARTS },
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

    let invoiceId: string | undefined;
    let invoiceNumber: string | undefined;
    let eDocumentCreated = false;

    await this.db.$transaction(async (tx) => {
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
              taxRate: new Prisma.Decimal(20),
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
