import { InvoiceStatus, type PrismaClient } from '@prisma/client';

export type StarterHealthIssueKey = 'missing_tax_rate' | 'negative_stock' | 'overdue_invoice';
export type StarterHealthSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface StarterHealthIssue {
  key: StarterHealthIssueKey;
  title: string;
  description: string;
  count: number;
  severity: StarterHealthSeverity;
  actionLabel: string;
  href: string;
}

export interface StarterHealthScore {
  score: number;
  issues: StarterHealthIssue[];
  generatedAt: string;
}

export class StarterHealthService {
  constructor(private readonly prisma: PrismaClient) {}

  async getHealthScore(tenantId: string): Promise<StarterHealthScore> {
    const now = new Date();

    const [missingTaxRateCount, negativeStockCount, overdueInvoiceCount] = await this.prisma.$transaction([
      // 1. Missing tax rate: active products with taxRateId is null
      this.prisma.product.count({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
          taxRateId: null,
        },
      }),

      // 2. Negative stock: stock level quantity is less than 0 for active products
      this.prisma.stockLevel.count({
        where: {
          tenantId,
          quantity: { lt: 0 },
          product: {
            deletedAt: null,
            isActive: true,
          },
        },
      }),

      // 3. Overdue invoices: unpaid or partially paid invoices whose due date has passed
      this.prisma.invoice.count({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { status: InvoiceStatus.OVERDUE },
            {
              status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
              dueDate: { lt: now },
            },
          ],
        },
      }),
    ]);

    // Calculate score deductions
    // Missing tax rate: -5 per product, max deduction: 25
    const missingTaxRatePenalty = Math.min(25, missingTaxRateCount * 5);
    // Negative stock: -10 per stock level, max deduction: 40
    const negativeStockPenalty = Math.min(40, negativeStockCount * 10);
    // Overdue invoice: -10 per invoice, max deduction: 35
    const overdueInvoicePenalty = Math.min(35, overdueInvoiceCount * 10);

    const score = Math.max(0, 100 - (missingTaxRatePenalty + negativeStockPenalty + overdueInvoicePenalty));

    const issues: StarterHealthIssue[] = [];

    if (missingTaxRateCount > 0) {
      issues.push({
        key: 'missing_tax_rate',
        title: 'Eksik Vergi Oranı',
        description: 'Fatura ve tekliflerde vergi hesabı yapılabilmesi için ürünlerinizde KDV oranını belirleyin.',
        count: missingTaxRateCount,
        severity: 'medium',
        actionLabel: 'Ürünleri Düzenle',
        href: '/dashboard/products',
      });
    }

    if (negativeStockCount > 0) {
      issues.push({
        key: 'negative_stock',
        title: 'Eksi Stok Riski',
        description: 'Eksi stok seviyeleri maliyet, sevkiyat ve rezervasyon tutarlılığını bozar.',
        count: negativeStockCount,
        severity: 'critical',
        actionLabel: 'Stok Seviyelerini İncele',
        href: '/dashboard/stock',
      });
    }

    if (overdueInvoiceCount > 0) {
      issues.push({
        key: 'overdue_invoice',
        title: 'Vadesi Geçen Faturalar',
        description: 'Tahsilat gecikmeleri nakit akışını olumsuz etkiler. Vadesi geçen faturaları takip edin.',
        count: overdueInvoiceCount,
        severity: 'high',
        actionLabel: 'Faturaları İncele',
        href: '/dashboard/invoices',
      });
    }

    return {
      score,
      issues,
      generatedAt: now.toISOString(),
    };
  }
}
