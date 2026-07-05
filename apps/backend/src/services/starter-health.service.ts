import { InvoiceStatus, type PrismaClient } from '@prisma/client';

export type StarterHealthIssueKey =
  | 'missing_tax_rate'
  | 'negative_stock'
  | 'overdue_invoice'
  | 'missing_contact_tax_number'
  | 'missing_min_stock'
  | 'missing_invoice_prefix'
  | 'missing_cash_bank_account';
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

    const [
      missingTaxRateCount,
      negativeStockCount,
      overdueInvoiceCount,
      missingContactTaxNumberCount,
      missingMinStockCount,
      invoiceSequenceCount,
      invoicePrefixSettingCount,
      activeBankAccountCount,
      activeCashAccountCount,
    ] = await this.prisma.$transaction([
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
      this.prisma.contact.count({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
          OR: [{ taxNumber: null }, { taxNumber: '' }],
        },
      }),
      this.prisma.product.count({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
          minStockLevel: { lte: 0 },
        },
      }),
      this.prisma.numberSequence.count({
        where: {
          tenantId,
          module: { in: ['invoice', 'INVOICE'] },
          prefix: { not: '' },
        },
      }),
      this.prisma.tenantSetting.count({
        where: {
          tenantId,
          key: 'invoice_prefix',
          value: { not: '' },
        },
      }),
      this.prisma.bankAccount.count({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
        },
      }),
      this.prisma.cashAccount.count({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
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
    const missingContactTaxPenalty = Math.min(15, missingContactTaxNumberCount * 3);
    const missingMinStockPenalty = Math.min(15, missingMinStockCount * 2);
    const missingInvoicePrefixPenalty = invoiceSequenceCount + invoicePrefixSettingCount > 0 ? 0 : 10;
    const missingCashBankAccountPenalty = activeBankAccountCount + activeCashAccountCount > 0 ? 0 : 10;

    const score = Math.max(0, 100 - (missingTaxRatePenalty + negativeStockPenalty + overdueInvoicePenalty + missingContactTaxPenalty + missingMinStockPenalty + missingInvoicePrefixPenalty + missingCashBankAccountPenalty));

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

    if (missingContactTaxNumberCount > 0) {
      issues.push({
        key: 'missing_contact_tax_number',
        title: 'Vergi Numarasi Eksik Cariler',
        description: 'E-belge, muhasebe ve mutabakat surecleri icin cari vergi bilgilerini tamamlayin.',
        count: missingContactTaxNumberCount,
        severity: 'high',
        actionLabel: 'Carileri Duzenle',
        href: '/dashboard/contacts',
      });
    }

    if (missingMinStockCount > 0) {
      issues.push({
        key: 'missing_min_stock',
        title: 'Minimum Stok Esigi Eksik',
        description: 'Kritik stok uyarilari icin aktif urunlerde minimum stok seviyesini belirleyin.',
        count: missingMinStockCount,
        severity: 'medium',
        actionLabel: 'Urunleri Duzenle',
        href: '/dashboard/products',
      });
    }

    if (invoiceSequenceCount + invoicePrefixSettingCount === 0) {
      issues.push({
        key: 'missing_invoice_prefix',
        title: 'Fatura Prefixi Eksik',
        description: 'Otomatik fatura numarasi icin prefix ve seri ayari tamamlanmali.',
        count: 1,
        severity: 'medium',
        actionLabel: 'Prefix Ayarla',
        href: '/dashboard/settings/general',
      });
    }

    if (activeBankAccountCount + activeCashAccountCount === 0) {
      issues.push({
        key: 'missing_cash_bank_account',
        title: 'Kasa/Banka Hesabi Eksik',
        description: 'Tahsilat, odeme ve nakit takibi icin en az bir aktif kasa veya banka hesabi tanimlayin.',
        count: 1,
        severity: 'medium',
        actionLabel: 'Hesap Tanimla',
        href: '/dashboard/payments/cash-accounts',
      });
    }

    return {
      score,
      issues,
      generatedAt: now.toISOString(),
    };
  }
}
