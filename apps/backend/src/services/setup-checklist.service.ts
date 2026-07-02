import { PrismaClient } from '@prisma/client';

export type SetupChecklistItemKey = 'contacts' | 'products' | 'tax_rates' | 'currencies' | 'invoice_series';
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
  contacts: number;
  products: number;
  taxRates: number;
  currencies: number;
  invoiceSeries: number;
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
      contacts,
      products,
      taxRates,
      currencies,
      invoiceSequences,
      invoicePrefixSettings,
    ] = await this.prisma.$transaction([
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
    ]);

    return {
      contacts,
      products,
      taxRates,
      currencies,
      invoiceSeries: invoiceSequences + invoicePrefixSettings,
    };
  }

  private buildItems(counts: SetupChecklistCounts): SetupChecklistItem[] {
    return [
      makeItem(
        'contacts',
        'Cari hesap',
        'Ilk musteri veya tedarikci kartini olusturun.',
        counts.contacts,
        '/dashboard/contacts/new',
        'Cari ekle',
      ),
      makeItem(
        'products',
        'Urun / hizmet',
        'Fatura ve tekliflerde kullanilacak ilk urun veya hizmeti ekleyin.',
        counts.products,
        '/dashboard/products/new',
        'Urun ekle',
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
        'Fatura seri ayari',
        'Otomatik fatura numarasi icin seri ve prefix ayarini hazirlayin.',
        counts.invoiceSeries,
        '/dashboard/settings/general',
        'Seri ayarla',
        'recommended',
      ),
    ];
  }
}
