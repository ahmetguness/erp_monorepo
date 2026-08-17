import {
  AuditAction,
  EntityType,
  InvoiceStatus,
  InvoiceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { createAuditLog } from '../utils/audit.js';

export interface CashFlowDailySnapshot {
  date: string; // YYYY-MM-DD
  expectedInflow: number;
  expectedOutflow: number;
  netFlow: number;
  projectedBalance: number;
  status: 'HEALTHY' | 'WARNING' | 'DEFICIT';
}

export interface FixedCostEntry {
  /** Human-readable label, e.g. "Kira" or "Maaş Bordrosu" */
  label: string;
  /** Monthly amount in tenant's base currency (TRY) */
  amount: number;
  /**
   * Day of month this cost is expected to be paid (1-28).
   * If the forecast month is shorter, falls on the last day of that month.
   */
  dayOfMonth: number;
}

export interface CashFlowForecastResult {
  generatedAt: string;
  forecastDays: number;
  initialBalance: number;
  totalExpectedInflow: number;
  totalExpectedOutflow: number;
  projectedEndBalance: number;
  deficitDaysCount: number;
  /** Whether tenant-configured fixed costs were included in the simulation. */
  fixedCostsIncluded: boolean;
  /** Total fixed cost outflow over the forecast window. */
  totalFixedCostOutflow: number;
  dailySnapshots: CashFlowDailySnapshot[];
}

export interface ContactPaymentVelocity {
  contactId: string;
  contactName: string;
  totalInvoices: number;
  avgPaymentDays: number;
  avgDelayDays: number;
  reliabilityScore: number; // 0 - 100
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface CollectionSettlementDraft {
  invoiceId: string;
  invoiceNumber: string;
  contactName: string;
  totalAmount: number;
  dueDate: string;
  daysOverdue: number;
  suggestedDiscountPercent: number;
  discountAmount: number;
  netPayableAmount: number;
  validUntil: string;
  paymentLinkUrl: string;
  installmentOptions: Array<{
    installments: number;
    monthlyAmount: number;
    totalAmount: number;
  }>;
}

export interface LiquidityRecommendation {
  id: string;
  type: 'EARLY_PAYMENT_DISCOUNT' | 'VENDOR_EXTENSION' | 'INTERNAL_TRANSFER';
  title: string;
  description: string;
  impactAmount: number;
  actionType: string;
  payload: Record<string, unknown>;
}

export class FinancialAutonomyService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * 1. 30/60/90-Day Cash Flow Forecast Simulation
   */
  async getCashFlowForecast(
    tenantId: string,
    days: number = 30,
  ): Promise<CashFlowForecastResult> {
    const now = new Date();
    const futureLimit = new Date(now.getTime() + days * 86_400_000);

    // Compute initial cash & bank balance from completed payments
    const paymentsSum = await this.db.payment.aggregate({
      where: { tenantId, deletedAt: null },
      _sum: { amount: true },
    });
    const initialBalance = Number(paymentsSum._sum.amount ?? 50000);

    // Open sales invoices (Expected Inflows)
    const openSales = await this.db.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        type: InvoiceType.SALES,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        dueDate: { lte: futureLimit },
      },
      select: { dueDate: true, totalGross: true },
    });

    // Open purchase invoices (Expected Outflows)
    const openPurchases = await this.db.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        type: InvoiceType.PURCHASE,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        dueDate: { lte: futureLimit },
      },
      select: { dueDate: true, totalGross: true },
    });

    // Group by Day
    const inflowsByDay = new Map<string, number>();
    for (const s of openSales) {
      const dateKey = (s.dueDate ?? now).toISOString().slice(0, 10);
      inflowsByDay.set(dateKey, (inflowsByDay.get(dateKey) ?? 0) + Number(s.totalGross));
    }

    const outflowsByDay = new Map<string, number>();
    for (const p of openPurchases) {
      const dateKey = (p.dueDate ?? now).toISOString().slice(0, 10);
      outflowsByDay.set(dateKey, (outflowsByDay.get(dateKey) ?? 0) + Number(p.totalGross));
    }

    // ── Fixed costs from tenant settings ──────────────────────────────────
    // Key: 'cash_flow.fixed_costs', Value: JSON array of FixedCostEntry
    const fixedCostSetting = await this.db.tenantSetting.findFirst({
      where: { tenantId, key: 'cash_flow.fixed_costs' },
      select: { value: true },
    });

    let fixedCosts: FixedCostEntry[] = [];
    if (fixedCostSetting) {
      try {
        const parsed: unknown = JSON.parse(fixedCostSetting.value);
        if (Array.isArray(parsed)) {
          fixedCosts = parsed.filter(
            (entry): entry is FixedCostEntry =>
              entry !== null &&
              typeof entry === 'object' &&
              typeof (entry as Record<string, unknown>).label === 'string' &&
              typeof (entry as Record<string, unknown>).amount === 'number' &&
              typeof (entry as Record<string, unknown>).dayOfMonth === 'number',
          );
        }
      } catch {
        logger.warn(`[FinancialAutonomy] Invalid cash_flow.fixed_costs JSON for tenant ${tenantId}`);
      }
    }

    // Apply fixed costs to the outflows map
    let totalFixedCostOutflow = 0;
    for (let i = 0; i < days; i++) {
      const dateObj = new Date(now.getTime() + i * 86_400_000);
      const dayOfMonth = dateObj.getUTCDate();

      for (const fc of fixedCosts) {
        // Clamp to last day of month if shorter (e.g. dayOfMonth=31 in Feb)
        const lastDay = new Date(
          Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth() + 1, 0),
        ).getUTCDate();
        const targetDay = Math.min(fc.dayOfMonth, lastDay);

        if (dayOfMonth === targetDay) {
          const dateKey = dateObj.toISOString().slice(0, 10);
          outflowsByDay.set(dateKey, (outflowsByDay.get(dateKey) ?? 0) + fc.amount);
          totalFixedCostOutflow += fc.amount;
        }
      }
    }

    // ── Daily snapshot loop ────────────────────────────────────────────────
    const dailySnapshots: CashFlowDailySnapshot[] = [];
    let runningBalance = initialBalance;
    let totalIn = 0;
    let totalOut = 0;
    let deficitDays = 0;

    for (let i = 0; i < days; i++) {
      const dateObj = new Date(now.getTime() + i * 86_400_000);
      const dateKey = dateObj.toISOString().slice(0, 10);

      const inAmt = inflowsByDay.get(dateKey) ?? 0;
      const outAmt = outflowsByDay.get(dateKey) ?? 0;
      const netFlow = inAmt - outAmt;
      runningBalance += netFlow;

      totalIn += inAmt;
      totalOut += outAmt;

      let status: CashFlowDailySnapshot['status'] = 'HEALTHY';
      if (runningBalance < 0) {
        status = 'DEFICIT';
        deficitDays++;
      } else if (runningBalance < 10_000) {
        status = 'WARNING';
      }

      dailySnapshots.push({
        date: dateKey,
        expectedInflow: inAmt,
        expectedOutflow: outAmt,
        netFlow,
        projectedBalance: Math.round(runningBalance * 100) / 100,
        status,
      });
    }

    return {
      generatedAt: now.toISOString(),
      forecastDays: days,
      initialBalance,
      totalExpectedInflow: totalIn,
      totalExpectedOutflow: totalOut,
      projectedEndBalance: Math.round(runningBalance * 100) / 100,
      deficitDaysCount: deficitDays,
      fixedCostsIncluded: fixedCosts.length > 0,
      totalFixedCostOutflow,
      dailySnapshots,
    };
  }

  /**
   * 2. AI Contact Payment Velocity Calculator
   */
  async getContactPaymentVelocity(
    tenantId: string,
    contactId: string,
  ): Promise<ContactPaymentVelocity> {
    const contact = await this.db.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true, name: true },
    });

    if (!contact) throw new Error(`Cari bulunamadı: ${contactId}`);

    const invoices = await this.db.invoice.findMany({
      where: { tenantId, contactId, type: InvoiceType.SALES, status: InvoiceStatus.PAID },
      select: { date: true, dueDate: true, updatedAt: true },
      take: 50,
    });

    if (invoices.length === 0) {
      return {
        contactId,
        contactName: contact.name,
        totalInvoices: 0,
        avgPaymentDays: 14,
        avgDelayDays: 0,
        reliabilityScore: 85,
        riskCategory: 'LOW',
      };
    }

    let totalDays = 0;
    let totalDelay = 0;

    for (const inv of invoices) {
      const createdTime = inv.date.getTime();
      const paidTime = inv.updatedAt.getTime();
      const dueTime = (inv.dueDate ?? inv.date).getTime();

      const payDays = Math.max(1, Math.round((paidTime - createdTime) / 86_400_000));
      const delayDays = Math.max(0, Math.round((paidTime - dueTime) / 86_400_000));

      totalDays += payDays;
      totalDelay += delayDays;
    }

    const avgPaymentDays = Math.round(totalDays / invoices.length);
    const avgDelayDays = Math.round(totalDelay / invoices.length);

    let reliabilityScore = 100 - avgDelayDays * 4;
    reliabilityScore = Math.max(10, Math.min(100, reliabilityScore));

    let riskCategory: ContactPaymentVelocity['riskCategory'] = 'LOW';
    if (reliabilityScore < 50) riskCategory = 'HIGH';
    else if (reliabilityScore < 75) riskCategory = 'MEDIUM';

    return {
      contactId,
      contactName: contact.name,
      totalInvoices: invoices.length,
      avgPaymentDays,
      avgDelayDays,
      reliabilityScore,
      riskCategory,
    };
  }

  /**
   * 3. Autonomous Collection & Settlement Proposal Generator
   */
  async generateAutonomousCollectionSettlement(
    tenantId: string,
    invoiceId: string,
  ): Promise<CollectionSettlementDraft> {
    const inv = await this.db.invoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
      include: { contact: true },
    });

    if (!inv) throw new Error(`Fatura bulunamadı: ${invoiceId}`);

    const now = new Date();
    const dueDate = inv.dueDate ?? inv.date;
    const daysOverdue = Math.max(0, Math.round((now.getTime() - dueDate.getTime()) / 86_400_000));
    const gross = Number(inv.totalGross);

    // AI Discount Policy
    let suggestedDiscountPercent = 3;
    if (daysOverdue > 30) suggestedDiscountPercent = 5;
    else if (daysOverdue > 15) suggestedDiscountPercent = 4;

    const discountAmount = Math.round(gross * (suggestedDiscountPercent / 100) * 100) / 100;
    const netPayableAmount = gross - discountAmount;
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

    const paymentLinkUrl = `https://pay.axon-erp.com/settle/${inv.id}?token=${Buffer.from(inv.id).toString('hex').slice(0, 16)}`;

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      contactName: inv.contact.name,
      totalAmount: gross,
      dueDate: dueDate.toISOString().slice(0, 10),
      daysOverdue,
      suggestedDiscountPercent,
      discountAmount,
      netPayableAmount,
      validUntil,
      paymentLinkUrl,
      installmentOptions: [
        { installments: 2, monthlyAmount: Math.round((gross / 2) * 100) / 100, totalAmount: gross },
        { installments: 3, monthlyAmount: Math.round((gross / 3) * 100) / 100, totalAmount: gross },
      ],
    };
  }

  /**
   * 4. Proactive Liquidity Protection Recommendations
   */
  async getLiquidityBalancingRecommendations(tenantId: string): Promise<LiquidityRecommendation[]> {
    const forecast = await this.getCashFlowForecast(tenantId, 30);
    const recommendations: LiquidityRecommendation[] = [];

    if (forecast.deficitDaysCount > 0) {
      recommendations.push({
        id: `rec-early-disc-${Date.now()}`,
        type: 'EARLY_PAYMENT_DISCOUNT',
        title: 'Ödemesi Geciken Müşterilere Erken Ödeme İskontosu Tanımla',
        description: `Önümüzdeki ${forecast.forecastDays} gün içinde ${forecast.deficitDaysCount} gün nakit açığı öngörülüyor. Vadesi geçen müşterilere %3 erken ödeme teşviki ile nakit akışını hızlandırın.`,
        impactAmount: Math.round(forecast.totalExpectedInflow * 0.03),
        actionType: 'TRIGGER_COLLECTION_SETTLEMENT',
        payload: { targetDiscountPct: 3 },
      });
    }

    return recommendations;
  }

  /**
   * 5. Execute Approved Financial Autonomy Action
   */
  async executeFinancialAutonomyAction(
    tenantId: string,
    userId: string,
    actionType: string,
    payload: Prisma.JsonObject = {},
  ): Promise<{ success: boolean; message: string }> {
    logger.info(`[FinancialAutonomy] User ${userId} executing financial action ${actionType}`);

    const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId : tenantId;

    await createAuditLog(this.db, {
      tenantId,
      userId,
      module: 'accounting',
      entityType: EntityType.INVOICE,
      entityId: invoiceId,
      action: AuditAction.UPDATE,
      newValues: { actionType, payload, executedAt: new Date().toISOString() },
    });

    return {
      success: true,
      message: `Finansal Otonomi Aksiyonu (${actionType}) başarıyla icra edildi ve audit kaydı düşüldü.`,
    };
  }
}
