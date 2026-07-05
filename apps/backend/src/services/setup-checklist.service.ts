import { PrismaClient } from '@prisma/client';

export type SetupChecklistItemKey =
  | 'company_profile'
  | 'tax_rates'
  | 'currencies'
  | 'invoice_series'
  | 'products'
  | 'contacts'
  | 'data_quality';
export type SetupChecklistSeverity = 'required' | 'recommended';

export interface SetupChecklistItem {
  key: SetupChecklistItemKey;
  label: string;
  description: string;
  completed: boolean;
  count: number;
  href: string;
  actionLabel: string;
  severity: SetupChecklistSeverity;
}

export interface SetupChecklistSummary {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
}

export interface SetupChecklistStatus {
  summary: SetupChecklistSummary;
  items: SetupChecklistItem[];
  generatedAt: string;
}

interface SetupChecklistCounts {
  companyProfile: number;
  contacts: number;
  products: number;
  taxRates: number;
  currencies: number;
  invoiceSeries: number;
  dataQuality: number;
}

function makeItem(
  key: SetupChecklistItemKey,
  label: string,
  description: string,
  count: number,
  href: string,
  actionLabel: string,
  severity: SetupChecklistSeverity = 'required',
): SetupChecklistItem {
  return {
    key,
    label,
    description,
    completed: count > 0,
    count,
    href,
    actionLabel,
    severity,
  };
}

export class SetupChecklistService {
  constructor(private readonly prisma: PrismaClient) {}

  async status(tenantId: string): Promise<SetupChecklistStatus> {
    const counts = await this.getCounts(tenantId);
    const items = this.buildItems(counts);
    const completed = items.filter((item) => item.completed).length;
    const total = items.length;

    return {
      summary: {
        total,
        completed,
        remaining: total - completed,
        percent: total > 0 ? Math.round((completed / total) * 100) : 100,
      },
      items,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getCounts(tenantId: string): Promise<SetupChecklistCounts> {
    const [
      tenant,
      contacts,
      products,
      taxRates,
      currencies,
      invoiceSequences,
      invoicePrefixSettings,
      contactsMissingTaxNumber,
      productsWithoutMinStock,
      productsMissingTaxRate,
      negativeStockLevels,
    ] = await this.prisma.$transaction([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { companyName: true, taxNumber: true, taxOffice: true, address: true, city: true },
      }),
      this.prisma.contact.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.product.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.taxRate.count({ where: { tenantId, isActive: true, isWithholding: false } }),
      this.prisma.currency.count({ where: { tenantId } }),
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
      this.prisma.contact.count({
        where: { tenantId, deletedAt: null, isActive: true, OR: [{ taxNumber: null }, { taxNumber: '' }] },
      }),
      this.prisma.product.count({ where: { tenantId, deletedAt: null, isActive: true, minStockLevel: { lte: 0 } } }),
      this.prisma.product.count({ where: { tenantId, deletedAt: null, isActive: true, taxRateId: null } }),
      this.prisma.stockLevel.count({ where: { tenantId, quantity: { lt: 0 } } }),
    ]);

    const companyProfile = tenant?.companyName?.trim() && tenant.taxNumber?.trim() && tenant.taxOffice?.trim() && tenant.address?.trim() && tenant.city?.trim() ? 1 : 0;
    const dataQualityIssueCount = contactsMissingTaxNumber + productsWithoutMinStock + productsMissingTaxRate + negativeStockLevels;

    return {
      companyProfile,
      contacts,
      products,
      taxRates,
      currencies,
      invoiceSeries: invoiceSequences + invoicePrefixSettings,
      dataQuality: dataQualityIssueCount === 0 && contacts > 0 && products > 0 ? 1 : 0,
    };
  }

  private buildItems(counts: SetupChecklistCounts): SetupChecklistItem[] {
    return [
      makeItem(
        'company_profile',
        'Sirket bilgileri',
        'Unvan, vergi bilgileri, adres ve sehir alanlarini tamamlayin.',
        counts.companyProfile,
        '/dashboard/settings/general',
        'Sirket bilgilerini gir',
      ),
      makeItem(
        'tax_rates',
        'Vergi oranlari',
        'KDV oranlarini tanimlayarak fatura kalemlerini hazir hale getirin.',
        counts.taxRates,
        '/dashboard/settings/tax-rates',
        'KDV ayarla',
      ),
      makeItem(
        'currencies',
        'Para birimi',
        'Varsayilan para birimini ve doviz tanimlarini tamamlayin.',
        counts.currencies,
        '/dashboard/settings/currencies',
        'Para birimi ayarla',
      ),
      makeItem(
        'invoice_series',
        'Fatura prefixi',
        'Otomatik fatura numarasi icin prefix ve seri ayarini hazirlayin.',
        counts.invoiceSeries,
        '/dashboard/settings/general',
        'Prefix ayarla',
      ),
      makeItem(
        'products',
        'Ilk urun',
        'Fatura ve tekliflerde kullanilacak ilk urun veya hizmeti ekleyin.',
        counts.products,
        '/dashboard/products/new',
        'Urun ekle',
      ),
      makeItem(
        'contacts',
        'Ilk cari hesap',
        'Ilk musteri veya tedarikci kartini olusturun.',
        counts.contacts,
        '/dashboard/contacts/new',
        'Cari ekle',
      ),
      makeItem(
        'data_quality',
        'Veri kalite kontrolu',
        'Eksik vergi no, KDV, minimum stok ve eksi stok kontrollerini temizleyin.',
        counts.dataQuality,
        '/dashboard',
        'Kalite skorunu incele',
      ),
    ];
  }
}
