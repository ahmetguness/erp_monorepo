'use client';

import type React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  PackageCheck,
  Percent,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Users,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { ContactListItem } from '@/services/contact.service';
import type { Product } from '@/services/product.service';
import type { StockLevel } from '@/services/stock.service';

export interface SmartFormLine {
  productId?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  net: number;
  gross: number;
}

export interface SmartFormSidePanelProps {
  formKind: 'quote' | 'invoice' | 'order';
  contact?: ContactListItem;
  products: readonly Product[];
  stockLevels?: readonly StockLevel[];
  stockLoading?: boolean;
  lines: readonly SmartFormLine[];
  totalGross: number;
  balanceImpact?: 'increase-receivable' | 'increase-payable';
  openQuoteCount?: number;
  openOrderCount?: number;
  className?: string;
}

type Tone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

interface Insight {
  id: string;
  title: string;
  detail: string;
  tone: Tone;
  icon: React.ReactNode;
  action?: string;
}

const TONE_CLASS: Record<Tone, string> = {
  danger: 'border-red-500/25 bg-red-500/[0.05] text-red-300',
  warning: 'border-amber-500/25 bg-amber-500/[0.06] text-amber-300',
  success: 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300',
  info: 'border-sky-500/20 bg-sky-500/[0.05] text-sky-300',
  neutral: 'border-slate-800 bg-slate-950/40 text-slate-300',
};

const FORM_KIND_LABEL: Record<SmartFormSidePanelProps['formKind'], string> = {
  quote: 'Teklif',
  invoice: 'Fatura',
  order: 'Siparis',
};

function findProduct(products: readonly Product[], id?: string): Product | undefined {
  if (!id) return undefined;
  return products.find((product) => product.id === id);
}

function formatPercent(value: number): string {
  return `%${value.toFixed(value % 1 === 0 ? 0 : 1)}`;
}

function calculateAverageDiscount(lines: readonly SmartFormLine[]): number {
  const pricedLines = lines.filter((line) => line.unitPrice > 0 && line.quantity > 0);
  if (pricedLines.length === 0) return 0;
  const total = pricedLines.reduce((sum, line) => sum + line.discount, 0);
  return total / pricedLines.length;
}

function calculateMinimumMargin(products: readonly Product[], lines: readonly SmartFormLine[]): number | null {
  const margins = lines.flatMap((line) => {
    const product = findProduct(products, line.productId);
    if (!product || line.unitPrice <= 0 || product.averageCost <= 0) return [];
    const effectivePrice = line.unitPrice * (1 - line.discount / 100);
    if (effectivePrice <= 0) return [-100];
    return [((effectivePrice - product.averageCost) / effectivePrice) * 100];
  });
  if (margins.length === 0) return null;
  return Math.min(...margins);
}

function buildInsights({
  contact,
  products,
  stockLevels = [],
  stockLoading = false,
  lines,
  totalGross,
  balanceImpact = 'increase-receivable',
  openQuoteCount = 0,
  openOrderCount = 0,
}: Pick<SmartFormSidePanelProps, 'contact' | 'products' | 'stockLevels' | 'stockLoading' | 'lines' | 'totalGross' | 'balanceImpact' | 'openQuoteCount' | 'openOrderCount'>): Insight[] {
  const insights: Insight[] = [];
  const selectedProductLines = lines.filter((line) => line.productId);
  const averageDiscount = calculateAverageDiscount(lines);
  const minimumMargin = calculateMinimumMargin(products, lines);
  const unavailableLines = selectedProductLines.filter((line) => {
    if (!line.productId) return false;
    if (stockLoading) return false;
    const availableQty = stockLevels
      .filter((level) => level.productId === line.productId)
      .reduce((sum, level) => sum + level.quantity, 0);
    return line.quantity > availableQty;
  });

  if (!contact) {
    insights.push({
      id: 'contact-required',
      title: 'Cari secimi bekleniyor',
      detail: 'Borc, risk ve acik isler cari secilince hesaplanir.',
      tone: 'neutral',
      icon: <Users className="h-4 w-4" />,
    });
  } else {
    const balance = Number(contact.currentBalance) || 0;
    const creditLimit = Number(contact.creditLimit) || 0;
    const projectedBalance = balanceImpact === 'increase-payable' ? balance - totalGross : balance + totalGross;
    const riskRatio = creditLimit > 0 ? (projectedBalance / creditLimit) * 100 : contact.riskRatio;

    insights.push({
      id: 'contact-balance',
      title: balance > 0 ? 'Musteri borcu var' : 'Borc riski dusuk',
      detail: `Mevcut bakiye ${formatCurrency(Math.abs(balance))}. Islem sonrasi risk ${formatPercent(Math.max(0, riskRatio))}.`,
      tone: riskRatio >= 100 || contact.riskLevel === 'exceeded' ? 'danger' : riskRatio >= 80 || contact.riskLevel === 'warning' ? 'warning' : 'success',
      icon: balance > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />,
      action: riskRatio >= 80 ? 'Tahsilat veya onay kontrolu onerilir' : undefined,
    });

    if (contact.openInvoiceCount > 0 || contact.overdueInvoiceCount > 0) {
      insights.push({
        id: 'open-work',
        title: 'Acik isler var',
        detail: `${contact.openInvoiceCount} acik fatura, ${contact.overdueInvoiceCount} gecikmis kayit gorunuyor.`,
        tone: contact.overdueInvoiceCount > 0 ? 'danger' : 'warning',
        icon: <ShoppingCart className="h-4 w-4" />,
        action: 'Cari hareketleri kontrol et',
      });
    }

    if (openQuoteCount > 0 || openOrderCount > 0) {
      insights.push({
        id: 'open-sales-flow',
        title: 'Acik teklif / siparis var',
        detail: `${openQuoteCount} acik teklif, ${openOrderCount} acik siparis ayni cari icin takipte.`,
        tone: 'info',
        icon: <ShoppingCart className="h-4 w-4" />,
        action: 'Mukerrer teklif veya teslimat kontrolu yap',
      });
    }
  }

  if (selectedProductLines.length === 0) {
    insights.push({
      id: 'product-required',
      title: 'Urun secimi bekleniyor',
      detail: 'Stok, son fiyat ve marj uyarilari urun secildikce canlanir.',
      tone: 'neutral',
      icon: <PackageCheck className="h-4 w-4" />,
    });
  } else if (stockLoading) {
    insights.push({
      id: 'stock-loading',
      title: 'Stok kontrol ediliyor',
      detail: 'Secili urunler icin depo miktari yukleniyor.',
      tone: 'neutral',
      icon: <PackageCheck className="h-4 w-4" />,
    });
  } else if (unavailableLines.length > 0) {
    insights.push({
      id: 'stock-warning',
      title: 'Stok esigi kontrol edilmeli',
      detail: `${unavailableLines.length} kalemde miktar urun minimum stok seviyesinin ustunde.`,
      tone: 'warning',
      icon: <PackageCheck className="h-4 w-4" />,
      action: 'Depo uygunlugunu teyit et',
    });
  } else {
    insights.push({
      id: 'stock-ok',
      title: 'Stok sinyali normal',
      detail: 'Secili urunlerde belirgin stok esigi uyarisi yok.',
      tone: 'success',
      icon: <PackageCheck className="h-4 w-4" />,
    });
  }

  if (averageDiscount > 0) {
    insights.push({
      id: 'discount',
      title: averageDiscount >= 15 ? 'Yuksek iskonto' : 'Iskonto uygulanmis',
      detail: `Ortalama iskonto ${formatPercent(averageDiscount)}. Onerilen iskonto ust siniri ${formatPercent(10)}.`,
      tone: averageDiscount >= 15 ? 'warning' : 'info',
      icon: <Percent className="h-4 w-4" />,
      action: averageDiscount >= 15 ? 'Yoneticiden onay al' : undefined,
    });
  }

  if (minimumMargin !== null) {
    insights.push({
      id: 'margin',
      title: minimumMargin < 10 ? 'Marj riski' : 'Marj saglikli',
      detail: `Secili urunlerde en dusuk tahmini marj ${formatPercent(minimumMargin)}.`,
      tone: minimumMargin < 0 ? 'danger' : minimumMargin < 10 ? 'warning' : 'success',
      icon: minimumMargin < 10 ? <TrendingDown className="h-4 w-4" /> : <CircleDollarSign className="h-4 w-4" />,
      action: minimumMargin < 10 ? 'Fiyat veya iskonto revize et' : undefined,
    });
  }

  return insights;
}

export function SmartFormSidePanel({
  formKind,
  contact,
  products,
  stockLevels,
  stockLoading,
  lines,
  totalGross,
  balanceImpact,
  openQuoteCount,
  openOrderCount,
  className,
}: SmartFormSidePanelProps) {
  const insights = buildInsights({ contact, products, stockLevels, stockLoading, lines, totalGross, balanceImpact, openQuoteCount, openOrderCount });
  const selectedProducts = lines
    .map((line) => ({ line, product: findProduct(products, line.productId) }))
    .filter((item): item is { line: SmartFormLine; product: Product } => Boolean(item.product));

  return (
    <div className={cn('space-y-4', className)}>
      <section className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-800/70 px-4 py-3">
          <Sparkles className="h-4 w-4 text-sky-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Akilli Yan Panel</h3>
            <p className="text-[11px] text-slate-500">{FORM_KIND_LABEL[formKind]} baglami</p>
          </div>
        </div>
        <div className="space-y-2.5 p-3">
          {insights.map((insight) => (
            <article key={insight.id} className={cn('rounded-xl border px-3 py-2.5', TONE_CLASS[insight.tone])}>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">{insight.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{insight.title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">{insight.detail}</p>
                  {insight.action && (
                    <p className="mt-1.5 rounded-lg bg-slate-950/55 px-2 py-1 text-[10px] font-medium text-slate-300">
                      {insight.action}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-400">Son fiyat / stok sinyali</p>
          <span className="text-[10px] text-slate-600">{selectedProducts.length} urun</span>
        </div>
        {selectedProducts.length > 0 ? (
          <div className="space-y-2.5">
            {selectedProducts.slice(0, 4).map(({ line, product }) => {
              const effectivePrice = line.unitPrice * (1 - line.discount / 100);
              return (
                <div key={`${product.id}-${line.quantity}-${line.unitPrice}`} className="rounded-lg bg-slate-950/45 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200">{product.name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{product.code}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-sky-300">{formatCurrency(effectivePrice)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Katalog {formatCurrency(product.salesPrice)}</span>
                    <span>Maliyet {formatCurrency(product.averageCost)}</span>
                  </div>
                  {stockLevels && (
                    <div className="mt-1 text-[10px] text-slate-600">
                      Stok {stockLevels
                        .filter((level) => level.productId === product.id)
                        .reduce((sum, level) => sum + level.quantity, 0)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs leading-5 text-slate-600">Urun secildikce katalog fiyatlari, tahmini marj ve stok sinyalleri burada gorunur.</p>
        )}
      </section>
    </div>
  );
}
