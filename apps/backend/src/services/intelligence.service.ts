import { InvoiceStatus, InvoiceType, MovementType, PaymentStatus, PermissionAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { storageService } from './storage.service.js';

type RecommendationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type RecommendationKind = 'LOW_STOCK' | 'PURCHASE_SUGGESTION' | 'SLOW_MOVING_STOCK' | 'COLLECTION_RISK' | 'LOW_MARGIN';
type AutomationRuleTrigger = 'LOW_STOCK' | 'OVERDUE_INVOICE' | 'HIGH_VALUE_INVOICE' | 'LOW_MARGIN' | 'CHECK_DUE_SOON';
type AutomationRuleAction = 'CREATE_PURCHASE_REQUEST_DRAFT' | 'CREATE_NOTIFICATION' | 'REQUEST_APPROVAL' | 'DRAFT_REMINDER_EMAIL' | 'CREATE_TASK';
type SectorKey = 'retail' | 'manufacturing' | 'technical_service' | 'ecommerce' | 'wholesale';

export interface PermissionView {
  isOwner: boolean;
  modules: Array<{ module: string; action: PermissionAction }>;
}

interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  detail: string;
  severity: RecommendationSeverity;
  module: string;
  href: string;
  actionLabel: string;
  assistantPrompt: string;
  value: number;
}

interface AutomationRuleTemplate {
  key: string;
  title: string;
  description: string;
  trigger: AutomationRuleTrigger;
  action: AutomationRuleAction;
  module: string;
  requiredModules: string[];
  requiredPermission: string;
}

interface SectorTemplate {
  key: SectorKey;
  title: string;
  modules: string[];
  dashboardFocus: string[];
  starterSettings: string[];
  automationTemplates: string[];
}

function canRead(permissions: PermissionView, module: string): boolean {
  return permissions.isOwner || permissions.modules.some((permission) => permission.module === module && permission.action === PermissionAction.READ);
}

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function money(value: number): string {
  return `${value.toFixed(2)} TRY`;
}

const AUTOMATION_TEMPLATES: AutomationRuleTemplate[] = [
  {
    key: 'low-stock-purchase-draft',
    title: 'Kritik stok icin satin alma taslagi',
    description: 'Minimum stok altina dusen urunler icin satin alma talebi taslagi hazirlar.',
    trigger: 'LOW_STOCK',
    action: 'CREATE_PURCHASE_REQUEST_DRAFT',
    module: 'inventory',
    requiredModules: ['inventory', 'purchasing'],
    requiredPermission: 'inventory:READ + purchasing:CREATE',
  },
  {
    key: 'overdue-invoice-reminder',
    title: 'Geciken fatura hatirlatmasi',
    description: 'Vadesi gecen satis faturalarini takip eder ve mail taslagi olusturur.',
    trigger: 'OVERDUE_INVOICE',
    action: 'DRAFT_REMINDER_EMAIL',
    module: 'invoicing',
    requiredModules: ['invoicing'],
    requiredPermission: 'invoicing:READ',
  },
  {
    key: 'high-value-invoice-approval',
    title: 'Yuksek tutarli fatura onayi',
    description: 'Belirlenen limit uzerindeki faturalar icin onay akisi onerir.',
    trigger: 'HIGH_VALUE_INVOICE',
    action: 'REQUEST_APPROVAL',
    module: 'approvals',
    requiredModules: ['invoicing', 'approvals'],
    requiredPermission: 'invoicing:READ + approvals:CREATE',
  },
  {
    key: 'low-margin-product-alert',
    title: 'Dusuk kar marji uyarisi',
    description: 'Satis fiyati maliyete yaklasan urunler icin fiyat gozden gecirme gorevi onerir.',
    trigger: 'LOW_MARGIN',
    action: 'CREATE_TASK',
    module: 'inventory',
    requiredModules: ['inventory'],
    requiredPermission: 'inventory:READ',
  },
  {
    key: 'check-due-soon-task',
    title: 'Yaklasan cek/senet gorevi',
    description: 'Vadesi yaklasan cek ve senetler icin tahsilat veya banka aksiyonu gorevi onerir.',
    trigger: 'CHECK_DUE_SOON',
    action: 'CREATE_TASK',
    module: 'accounting',
    requiredModules: ['accounting'],
    requiredPermission: 'accounting:READ',
  },
];

const SECTOR_TEMPLATES: SectorTemplate[] = [
  {
    key: 'retail',
    title: 'Perakende',
    modules: ['inventory', 'sales', 'invoicing', 'accounting', 'reporting'],
    dashboardFocus: ['Gunluk satis', 'kritik stok', 'dusuk marj', 'kasa hareketleri'],
    starterSettings: ['Hizli urun kategorileri', 'standart KDV oranlari', 'gunluk kasa kapanis rutini'],
    automationTemplates: ['low-stock-purchase-draft', 'low-margin-product-alert'],
  },
  {
    key: 'manufacturing',
    title: 'Uretim',
    modules: ['inventory', 'production', 'purchasing', 'accounting', 'reporting'],
    dashboardFocus: ['Is emirleri', 'hammadde stogu', 'uretim gecikmeleri', 'maliyet sapmasi'],
    starterSettings: ['Urun agaci kontrol listesi', 'is merkezi tanimlari', 'hammadde minimum stoklari'],
    automationTemplates: ['low-stock-purchase-draft', 'high-value-invoice-approval'],
  },
  {
    key: 'technical_service',
    title: 'Teknik servis',
    modules: ['service', 'contacts', 'inventory', 'invoicing', 'notifications'],
    dashboardFocus: ['Atanmis servisler', 'SLA riski', 'yedek parca stogu', 'musteri varliklari'],
    starterSettings: ['Servis oncelikleri', 'yedek parca kategorileri', 'musteri varlik sablonlari'],
    automationTemplates: ['low-stock-purchase-draft', 'overdue-invoice-reminder'],
  },
  {
    key: 'ecommerce',
    title: 'E-ticaret',
    modules: ['marketplace', 'inventory', 'sales', 'invoicing', 'reporting'],
    dashboardFocus: ['Pazaryeri siparisleri', 'listeleme hatalari', 'stok eslesmesi', 'iade takibi'],
    starterSettings: ['Pazaryeri stok eslesme kurallari', 'urun listeleme kontrol listesi'],
    automationTemplates: ['low-stock-purchase-draft', 'low-margin-product-alert'],
  },
  {
    key: 'wholesale',
    title: 'Toptan satis',
    modules: ['contacts', 'sales', 'purchasing', 'inventory', 'accounting'],
    dashboardFocus: ['Cari risk', 'tahsilat gecikmesi', 'toplu siparisler', 'cek/senet vadeleri'],
    starterSettings: ['Cari vade politikalari', 'risk limitleri', 'toptan fiyat listesi kontrolu'],
    automationTemplates: ['overdue-invoice-reminder', 'check-due-soon-task'],
  },
];

export const IntelligenceService = {
  async getRecommendations(tenantId: string, permissions: PermissionView): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

    if (canRead(permissions, 'inventory')) {
      const stockLevels = await prisma.stockLevel.findMany({
        where: {
          tenantId,
          product: { tenantId, deletedAt: null, isActive: true, minStockLevel: { gt: 0 } },
        },
        select: {
          productId: true,
          quantity: true,
          product: { select: { code: true, name: true, minStockLevel: true, purchasePrice: true, salesPrice: true, averageCost: true } },
        },
        take: 500,
      });

      const stockByProduct = new Map<string, { code: string; name: string; quantity: number; minStock: number; purchasePrice: number; salesPrice: number; averageCost: number }>();
      for (const level of stockLevels) {
        const current = stockByProduct.get(level.productId);
        if (current) {
          current.quantity += asNumber(level.quantity);
        } else {
          stockByProduct.set(level.productId, {
            code: level.product.code,
            name: level.product.name,
            quantity: asNumber(level.quantity),
            minStock: asNumber(level.product.minStockLevel),
            purchasePrice: asNumber(level.product.purchasePrice),
            salesPrice: asNumber(level.product.salesPrice),
            averageCost: asNumber(level.product.averageCost),
          });
        }
      }

      const lowStock = [...stockByProduct.values()]
        .map((item) => ({ ...item, deficit: Math.ceil(item.minStock - item.quantity) }))
        .filter((item) => item.deficit > 0)
        .sort((a, b) => b.deficit - a.deficit);

      if (lowStock[0]) {
        const top = lowStock[0];
        recommendations.push({
          id: 'rec-low-stock',
          kind: 'LOW_STOCK',
          title: 'Kritik stok var',
          detail: `${top.code} - ${top.name}: ${top.deficit} adet onerilen tamamlanma`,
          severity: lowStock.length > 5 ? 'CRITICAL' : 'HIGH',
          module: 'inventory',
          href: '/dashboard/stock/levels',
          actionLabel: 'Satin alma taslagi',
          assistantPrompt: 'Stokta kritik urunleri bul ve bunlar icin taslak satin alma talebi olustur',
          value: lowStock.length,
        });
      }

      const lowMargin = [...stockByProduct.values()]
        .map((item) => {
          const cost = item.averageCost > 0 ? item.averageCost : item.purchasePrice;
          const margin = item.salesPrice - cost;
          const marginRate = item.salesPrice > 0 ? margin / item.salesPrice : 0;
          return { ...item, cost, margin, marginRate };
        })
        .filter((item) => item.salesPrice > 0 && item.cost > 0 && item.marginRate < 0.12)
        .sort((a, b) => a.marginRate - b.marginRate);

      if (lowMargin[0]) {
        const top = lowMargin[0];
        recommendations.push({
          id: 'rec-low-margin',
          kind: 'LOW_MARGIN',
          title: 'Dusuk kar marji riski',
          detail: `${top.code} - ${top.name}: marj ${(top.marginRate * 100).toFixed(1)}%`,
          severity: top.margin < 0 ? 'CRITICAL' : 'MEDIUM',
          module: 'inventory',
          href: '/dashboard/products',
          actionLabel: 'Fiyat oner',
          assistantPrompt: 'Urunleri alim ve satis fiyatlarina gore incele, dusuk kar marji olanlar icin fiyat onerisi hazirla',
          value: lowMargin.length,
        });
      }

      const outboundProductIds = new Set((await prisma.stockMovement.findMany({
        where: { tenantId, type: MovementType.OUT, createdAt: { gte: ninetyDaysAgo } },
        select: { productId: true },
        distinct: ['productId'],
      })).map((movement) => movement.productId));

      const slowMoving = [...stockByProduct.entries()]
        .filter(([, item]) => item.quantity > 0)
        .filter(([productId]) => !outboundProductIds.has(productId));

      if (slowMoving.length > 0) {
        recommendations.push({
          id: 'rec-slow-moving',
          kind: 'SLOW_MOVING_STOCK',
          title: 'Yavas donen stok',
          detail: `${slowMoving.length} urunde son 90 gunde cikis yok`,
          severity: 'MEDIUM',
          module: 'inventory',
          href: '/dashboard/stock/levels',
          actionLabel: 'Listele',
          assistantPrompt: 'Son 90 gunde hareket gormeyen stoklu urunleri listele ve aksiyon oner',
          value: slowMoving.length,
        });
      }
    }

    if (canRead(permissions, 'invoicing')) {
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          type: InvoiceType.SALES,
          OR: [
            { status: InvoiceStatus.OVERDUE },
            { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { lt: now } },
          ],
        },
        select: { id: true, number: true, dueDate: true, totalGross: true, contact: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 25,
      });

      if (overdueInvoices.length > 0) {
        const total = overdueInvoices.reduce((sum, invoice) => sum + asNumber(invoice.totalGross), 0);
        recommendations.push({
          id: 'rec-collection-risk',
          kind: 'COLLECTION_RISK',
          title: 'Geciken tahsilat riski',
          detail: `${overdueInvoices.length} fatura, toplam ${money(total)}`,
          severity: total > 100_000 ? 'CRITICAL' : 'HIGH',
          module: 'invoicing',
          href: '/dashboard/invoices',
          actionLabel: 'Mail taslagi',
          assistantPrompt: 'Vadesi gecmis faturalari listele ve musterilere gonderilecek hatirlatma maili hazirla',
          value: overdueInvoices.length,
        });
      }
    }

    if (canRead(permissions, 'accounting')) {
      const pendingPayments = await prisma.payment.findMany({
        where: { tenantId, deletedAt: null, status: PaymentStatus.PENDING },
        select: { amount: true },
        take: 50,
      });
      const pendingTotal = pendingPayments.reduce((sum, payment) => sum + asNumber(payment.amount), 0);
      if (pendingTotal > 0) {
        recommendations.push({
          id: 'rec-cash-pressure',
          kind: 'COLLECTION_RISK',
          title: 'Nakit cikisi baskisi',
          detail: `Bekleyen odeme toplamı ${money(pendingTotal)}`,
          severity: pendingTotal > 100_000 ? 'HIGH' : 'MEDIUM',
          module: 'accounting',
          href: '/dashboard/payments',
          actionLabel: 'Risk tahmini',
          assistantPrompt: 'Bu ay nakit akisi riskini tahmin et ve bekleyen odemeleri yorumla',
          value: pendingPayments.length,
        });
      }
    }

    return recommendations.sort((a, b) => {
      const rank: Record<RecommendationSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return rank[a.severity] - rank[b.severity] || b.value - a.value;
    }).slice(0, 8);
  },

  getAutomationTemplates(permissions: PermissionView): AutomationRuleTemplate[] {
    return AUTOMATION_TEMPLATES.filter((template) => template.requiredModules.every((module) => canRead(permissions, module)));
  },

  async previewAutomationTemplates(tenantId: string, permissions: PermissionView) {
    const recommendations = await this.getRecommendations(tenantId, permissions);
    const activeKinds = new Set(recommendations.map((recommendation) => recommendation.kind));
    return this.getAutomationTemplates(permissions).map((template) => ({
      ...template,
      matched:
        (template.trigger === 'LOW_STOCK' && activeKinds.has('LOW_STOCK')) ||
        (template.trigger === 'OVERDUE_INVOICE' && activeKinds.has('COLLECTION_RISK')) ||
        (template.trigger === 'LOW_MARGIN' && activeKinds.has('LOW_MARGIN')) ||
        (template.trigger === 'CHECK_DUE_SOON' && canRead(permissions, 'accounting')) ||
        template.trigger === 'HIGH_VALUE_INVOICE',
      mode: 'preview',
    }));
  },

  getSectorTemplates(): SectorTemplate[] {
    return SECTOR_TEMPLATES;
  },

  async getDocumentDraft(tenantId: string, attachmentId: string) {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, tenantId },
      select: { id: true, fileName: true, mimeType: true, storagePath: true, entityType: true, entityId: true },
    });
    if (!attachment) return null;

    if (attachment.mimeType !== 'text/plain' && attachment.mimeType !== 'text/csv') {
      return {
        attachment: { id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType },
        status: 'PROVIDER_REQUIRED',
        providerRequired: true,
        message: 'PDF/gorsel OCR icin harici OCR saglayicisi baglanmali. Text/CSV belgelerde taslak cikarimi desteklenir.',
      };
    }

    const stored = await storageService.get(attachment.storagePath);
    if (!stored) return null;

    const text = stored.body.toString('utf8').slice(0, 20_000);
    const amountMatch = text.match(/(?:toplam|total|tutar|amount)\D{0,20}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/i);
    const taxMatch = text.match(/(?:kdv|vat|tax)\D{0,20}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/i);
    const invoiceNoMatch = text.match(/(?:fatura|invoice|fis|receipt)\D{0,20}([A-Z0-9-]{3,30})/i);

    return {
      attachment: { id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType },
      status: 'DRAFT_READY',
      providerRequired: false,
      draft: {
        documentType: text.toLowerCase().includes('invoice') || text.toLowerCase().includes('fatura') ? 'invoice' : 'document',
        referenceNo: invoiceNoMatch?.[1] ?? null,
        grossAmountText: amountMatch?.[1] ?? null,
        taxAmountText: taxMatch?.[1] ?? null,
        confidence: amountMatch || invoiceNoMatch ? 'MEDIUM' : 'LOW',
      },
      previewText: text.slice(0, 800),
    };
  },
};
