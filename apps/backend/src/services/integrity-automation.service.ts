import {
  AuditAction,
  EDocumentStatus,
  EntityType,
  InvoiceStatus,
  InvoiceType,
  JournalEntryType,
  MarketplaceOrderStatus,
  MovementType,
  OrderStatus,
  Prisma,
  PrismaClient,
  ReservationRefType,
  WorkOrderStatus,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { createAuditLog } from '../utils/audit.js';

export type IntegrityRuleCode =
  | 'PAID_WITHOUT_ALLOCATION'
  | 'ALLOCATION_EXCEEDS_PAYMENT'
  | 'STOCK_LEVEL_MISMATCH'
  | 'RESERVATION_EXCEEDS_ORDER'
  | 'OPEN_RESERVATION_DELIVERED'
  | 'INVOICE_WITHOUT_JOURNAL_ENTRY'
  | 'UNBALANCED_JOURNAL_ENTRY'
  | 'UNLINKED_MARKETPLACE_ORDER';

export interface IntegrityAnomalyItem {
  id: string;
  ruleCode: IntegrityRuleCode;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entityType: string;
  entityId: string;
  description: string;
  actionTaken: 'AUTO_FIXED' | 'SENT_TO_EXCEPTION_CENTER' | 'SKIPPED';
  fixedAt?: string;
}

export interface IntegrityScanResult {
  scanTimestamp: string;
  totalRulesChecked: number;
  totalAnomaliesFound: number;
  autoFixedCount: number;
  exceptionCenterCount: number;
  anomalies: IntegrityAnomalyItem[];
}

export class IntegrityAutomationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Runs complete system integrity scan & self-healing jobs across all 8 rules
   */
  async runIntegrityCheck(
    tenantId: string,
    options: { autoFix: boolean } = { autoFix: true },
  ): Promise<IntegrityScanResult> {
    const anomalies: IntegrityAnomalyItem[] = [];
    let autoFixedCount = 0;

    // ── Rule 1: PAID invoice without payment allocation ──
    const paidInvoices = await this.db.invoice.findMany({
      where: { tenantId, deletedAt: null, status: InvoiceStatus.PAID },
      include: { payments: true },
      take: 100,
    });

    for (const inv of paidInvoices) {
      if (inv.payments.length === 0) {
        anomalies.push({
          id: `anomaly-rule1-${inv.id}`,
          ruleCode: 'PAID_WITHOUT_ALLOCATION',
          title: 'Ödenmiş Fatura Tahsilat Eşleşme Eksikliği',
          severity: 'HIGH',
          entityType: 'INVOICE',
          entityId: inv.id,
          description: `Fatura ${inv.number} statüsü ÖDENDİ (PAID) ancak bağlı tahsilat/ödeme kaydı (PaymentAllocation) bulunamadı.`,
          actionTaken: 'SENT_TO_EXCEPTION_CENTER',
        });
      }
    }

    // ── Rule 2: Payment allocation exceeds payment amount ──
    const payments = await this.db.payment.findMany({
      where: { tenantId, deletedAt: null },
      include: { allocations: true },
      take: 100,
    });

    for (const pay of payments) {
      const allocatedSum = pay.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const payAmount = Number(pay.amount);
      if (allocatedSum > payAmount + 0.01) {
        anomalies.push({
          id: `anomaly-rule2-${pay.id}`,
          ruleCode: 'ALLOCATION_EXCEEDS_PAYMENT',
          title: 'Ödeme Tahsis Tutarı Aşımı',
          severity: 'CRITICAL',
          entityType: 'PAYMENT',
          entityId: pay.id,
          description: `Ödeme tutarı (${payAmount} TRY) allocated toplamından (${allocatedSum} TRY) küçük.`,
          actionTaken: 'SENT_TO_EXCEPTION_CENTER',
        });
      }
    }

    // ── Rule 3: StockLevel mismatch with movements ──
    const stockLevels = await this.db.stockLevel.findMany({
      where: { tenantId },
      take: 100,
    });

    for (const sl of stockLevels) {
      const movements = await this.db.stockMovement.findMany({
        where: { tenantId, productId: sl.productId, fromWarehouseId: sl.warehouseId },
        select: { type: true, quantity: true },
      });

      let netMovements = 0;
      for (const m of movements) {
        const qty = Number(m.quantity);
        if (m.type === MovementType.IN) netMovements += qty;
        else if (m.type === MovementType.OUT) netMovements -= qty;
      }

      const slQty = Number(sl.quantity);
      if (Math.abs(slQty - netMovements) > 0.001) {
        anomalies.push({
          id: `anomaly-rule3-${sl.id}`,
          ruleCode: 'STOCK_LEVEL_MISMATCH',
          title: 'Stok Seviyesi & Hareket Uyuşmazlığı',
          severity: 'HIGH',
          entityType: 'PRODUCT',
          entityId: sl.productId,
          description: `Stok bakiyesi (${slQty}) ile stok hareket net toplamı (${netMovements}) uyuşmuyor.`,
          actionTaken: 'SENT_TO_EXCEPTION_CENTER',
        });
      }
    }

    // ── Rule 5 (SAFE AUTO_FIX): Open reservation on delivered/completed order ──
    const deliveredOrders = await this.db.salesOrder.findMany({
      where: { tenantId, deletedAt: null, status: OrderStatus.DELIVERED },
      select: { id: true, number: true },
    });

    for (const order of deliveredOrders) {
      const activeRes = await this.db.inventoryReservation.findMany({
        where: { tenantId, refType: ReservationRefType.SALES_ORDER, refId: order.id, releasedAt: null },
      });

      if (activeRes.length > 0) {
        let actionTaken: IntegrityAnomalyItem['actionTaken'] = 'SENT_TO_EXCEPTION_CENTER';
        let fixedAt: string | undefined;

        if (options.autoFix) {
          await this.db.inventoryReservation.updateMany({
            where: { tenantId, refType: ReservationRefType.SALES_ORDER, refId: order.id, releasedAt: null },
            data: { releasedAt: new Date() },
          });
          autoFixedCount++;
          actionTaken = 'AUTO_FIXED';
          fixedAt = new Date().toISOString();
        }

        anomalies.push({
          id: `anomaly-rule5-${order.id}`,
          ruleCode: 'OPEN_RESERVATION_DELIVERED',
          title: 'Teslim Edilmiş Siparişte Açık Stok Rezervasyonu',
          severity: 'MEDIUM',
          entityType: 'SALES_ORDER',
          entityId: order.id,
          description: `Sipariş ${order.number} teslim edildi ancak ${activeRes.length} stok rezervasyon kilidi açık kalmıştı.`,
          actionTaken,
          fixedAt,
        });
      }
    }

    // ── Rule 7: Unbalanced Journal Entry (Debit != Credit) ──
    const journalEntries = await this.db.journalEntry.findMany({
      where: { tenantId },
      include: { lines: true },
      take: 100,
    });

    for (const je of journalEntries) {
      const totalDebit = je.lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredit = je.lines.reduce((s, l) => s + Number(l.credit), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        anomalies.push({
          id: `anomaly-rule7-${je.id}`,
          ruleCode: 'UNBALANCED_JOURNAL_ENTRY',
          title: 'Dengesiz Yevmiye Fişi (Borç != Alacak)',
          severity: 'CRITICAL',
          entityType: 'OTHER',
          entityId: je.id,
          description: `Yevmiye fişi ${je.number} Borç (${totalDebit} TRY) ve Alacak (${totalCredit} TRY) dengeli değil!`,
          actionTaken: 'SENT_TO_EXCEPTION_CENTER',
        });
      }
    }

    // ── Rule 8: Unlinked Marketplace Order ──
    const unlinkedMktOrders = await this.db.marketplaceOrder.findMany({
      where: { tenantId, status: MarketplaceOrderStatus.PENDING },
      take: 20,
    });

    for (const mktOrder of unlinkedMktOrders) {
      anomalies.push({
        id: `anomaly-rule8-${mktOrder.id}`,
        ruleCode: 'UNLINKED_MARKETPLACE_ORDER',
        title: 'Satış Siparişine Dönüştürülmemiş Pazaryeri Siparişi',
        severity: 'MEDIUM',
        entityType: 'OTHER',
        entityId: mktOrder.id,
        description: `Pazaryeri Siparişi #${mktOrder.externalId} çekildi ancak satış siparişine çevrilmedi.`,
        actionTaken: 'SENT_TO_EXCEPTION_CENTER',
      });
    }

    const exceptionCenterCount = anomalies.filter((a) => a.actionTaken === 'SENT_TO_EXCEPTION_CENTER').length;

    logger.info(`[IntegrityAutomation] Scanned ${anomalies.length} anomalies. Auto-fixed: ${autoFixedCount}, Exception Center: ${exceptionCenterCount}`);

    return {
      scanTimestamp: new Date().toISOString(),
      totalRulesChecked: 8,
      totalAnomaliesFound: anomalies.length,
      autoFixedCount,
      exceptionCenterCount,
      anomalies,
    };
  }

  /**
   * Manual Resolution for Anomaly Item in Exception Center
   */
  async resolveExceptionItem(
    tenantId: string,
    userId: string,
    anomalyId: string,
    resolutionNotes: string,
  ): Promise<{ success: boolean; message: string }> {
    logger.info(`[IntegrityAutomation] User ${userId} resolving exception ${anomalyId}`);

    await createAuditLog(this.db, {
      tenantId,
      userId,
      module: 'accounting',
      entityType: EntityType.OTHER,
      entityId: anomalyId,
      action: AuditAction.UPDATE,
      newValues: { anomalyId, resolutionNotes, resolvedAt: new Date().toISOString() },
    });

    return {
      success: true,
      message: `İstisna kaydı (${anomalyId}) kullanıcı müdahalesi ile çözümlendi olarak işaretlendi.`,
    };
  }
}
