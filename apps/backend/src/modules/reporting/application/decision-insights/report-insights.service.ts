import type { ReportInsightsRepository } from './report-insights.ports.js';
import type { ReportDecisionInsight, ReportDecisionWorkspace, ReportInsightSnapshot } from './report-insights.types.js';

const round = (value: number): number => Number(value.toFixed(2));
function change(current: number, previous: number): number | null { return previous === 0 ? null : round(((current - previous) / Math.abs(previous)) * 100); }
function confidence(sampleCount: number): number { return Math.min(98, 55 + sampleCount * 5); }

export function buildReportInsights(snapshot: ReportInsightSnapshot): ReportDecisionInsight[] {
  const insights: ReportDecisionInsight[] = [];
  const revenueChange = change(snapshot.currentRevenue, snapshot.previousRevenue);
  if (revenueChange !== null && Math.abs(revenueChange) >= 10) insights.push({
    id: 'revenue-period-change', category: 'REVENUE', severity: revenueChange <= -20 ? 'CRITICAL' : revenueChange < 0 ? 'WARNING' : 'INFO',
    title: revenueChange < 0 ? `Gelir önceki döneme göre %${Math.abs(revenueChange)} azaldı` : `Gelir önceki döneme göre %${revenueChange} arttı`,
    explanation: `Satış geliri ${round(snapshot.previousRevenue)} TL seviyesinden ${round(snapshot.currentRevenue)} TL seviyesine geldi.`,
    metric: { current: snapshot.currentRevenue, previous: snapshot.previousRevenue, changePercent: revenueChange, unit: 'TRY' },
    rootCauses: snapshot.decliningProducts.slice(0, 3).map((item) => `${item.productName}: ${round(item.previousRevenue - item.currentRevenue)} TL gelir kaybı`), confidence: confidence(snapshot.decliningProducts.length),
    action: { label: 'Satış siparişlerini incele', href: '/dashboard/sales-orders', expectedImpact: revenueChange < 0 ? 'Gelir kaybına en fazla katkı yapan ürün ve siparişleri önceliklendirir.' : 'Büyümeyi sağlayan ürünlere stok ve satış kapasitesi ayırır.' },
    sources: snapshot.decliningProducts.slice(0, 5).map((item) => ({ entityType: 'PRODUCT', entityId: item.productId, label: `${item.productCode} · ${item.productName}`, href: `/dashboard/products/${item.productId}` })),
  });
  const expenseChange = change(snapshot.currentExpense, snapshot.previousExpense);
  if (expenseChange !== null && expenseChange >= 10) insights.push({
    id: 'expense-period-increase', category: 'EXPENSE', severity: expenseChange >= 25 ? 'CRITICAL' : 'WARNING', title: `Giderler önceki döneme göre %${expenseChange} arttı`, explanation: `Alış faturaları ${round(snapshot.previousExpense)} TL seviyesinden ${round(snapshot.currentExpense)} TL seviyesine yükseldi.`,
    metric: { current: snapshot.currentExpense, previous: snapshot.previousExpense, changePercent: expenseChange, unit: 'TRY' }, rootCauses: snapshot.expenseDrivers.slice(0, 3).map((item) => `${item.contactName}: +${round(item.currentAmount - item.previousAmount)} TL`), confidence: confidence(snapshot.expenseDrivers.length),
    action: { label: 'Alış faturalarını incele', href: '/dashboard/invoices?type=PURCHASE', expectedImpact: 'Artışın yoğunlaştığı tedarikçileri ve tekrarlayan giderleri görünür kılar.' }, sources: snapshot.expenseDrivers.slice(0, 5).map((item) => ({ entityType: 'CONTACT', entityId: item.contactId, label: item.contactName, href: `/dashboard/contacts/${item.contactId}` })),
  });
  if (snapshot.overdueTotal > 0) insights.push({
    id: 'overdue-collections', category: 'COLLECTION', severity: snapshot.overdueInvoices.length >= 5 ? 'CRITICAL' : 'WARNING', title: `${snapshot.overdueInvoices.length} gecikmiş faturada ${round(snapshot.overdueTotal)} TL tahsilat bekliyor`, explanation: 'Vadesi geçen satış faturaları nakit akışını ve ödeme kapasitesini baskılıyor.', metric: { current: snapshot.overdueTotal, previous: null, changePercent: null, unit: 'TRY' }, rootCauses: snapshot.overdueInvoices.slice(0, 3).map((item) => `${item.contactName} · ${item.number}: ${round(item.amount)} TL`), confidence: 98,
    action: { label: 'Tahsilat aksiyonu al', href: '/dashboard/collection-reminders', expectedImpact: `En fazla ${round(snapshot.overdueTotal)} TL gecikmiş alacağı tahsilat sürecine taşır.` }, sources: snapshot.overdueInvoices.slice(0, 10).map((item) => ({ entityType: 'INVOICE', entityId: item.id, label: `${item.number} · ${item.contactName}`, href: `/dashboard/invoices/${item.id}` })),
  });
  if (snapshot.lowStock.length > 0) insights.push({
    id: 'stock-service-risk', category: 'STOCK', severity: snapshot.lowStock.length >= 5 ? 'CRITICAL' : 'WARNING', title: `${snapshot.lowStock.length} ürün servis seviyesini riske atıyor`, explanation: 'Mevcut stok minimum seviyenin altında; açık talep yeni satışların karşılanmasını geciktirebilir.', metric: { current: snapshot.lowStock.length, previous: null, changePercent: null, unit: 'COUNT' }, rootCauses: snapshot.lowStock.slice(0, 3).map((item) => `${item.productName}: ${item.quantity}/${item.minimum}`), confidence: 95,
    action: { label: 'İkmal senaryosu oluştur', href: '/dashboard/procurement/autonomy', expectedImpact: 'Kritik ürünleri talep tahmini ve tedarik süresine göre satın alma taslağına dönüştürür.' }, sources: snapshot.lowStock.slice(0, 10).map((item) => ({ entityType: 'PRODUCT', entityId: item.productId, label: `${item.productCode} · ${item.productName}`, href: `/dashboard/products/${item.productId}` })),
  });
  return insights.sort((left, right) => ({ CRITICAL: 0, WARNING: 1, INFO: 2 })[left.severity] - ({ CRITICAL: 0, WARNING: 1, INFO: 2 })[right.severity]);
}

export class ReportDecisionInsightsService {
  constructor(private readonly repository: ReportInsightsRepository) {}
  async workspace(tenantId: string, from: Date, to: Date): Promise<ReportDecisionWorkspace> {
    const duration = Math.max(1, to.getTime() - from.getTime() + 1);
    const previousTo = new Date(from.getTime() - 1); const previousFrom = new Date(previousTo.getTime() - duration + 1);
    const snapshot = await this.repository.loadSnapshot(tenantId, { from, to, previousFrom, previousTo });
    const insights = buildReportInsights(snapshot); const critical = insights.filter((item) => item.severity === 'CRITICAL').length;
    return { generatedAt: new Date().toISOString(), period: { from: from.toISOString(), to: to.toISOString(), previousFrom: previousFrom.toISOString(), previousTo: previousTo.toISOString() }, summary: { totalInsights: insights.length, critical, potentialCashImpact: round(snapshot.overdueTotal) }, executiveSummary: insights.length === 0 ? 'Seçili dönemde aksiyon gerektiren belirgin bir sapma bulunmadı.' : `${critical > 0 ? `${critical} kritik konu var.` : 'Kritik konu yok.'} Öncelikli ${insights.length} içgörü için önerilen aksiyonlar hazırlandı.`, insights };
  }
}
