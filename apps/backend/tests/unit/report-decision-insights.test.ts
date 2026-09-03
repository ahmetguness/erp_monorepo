import { describe, expect, it } from 'vitest';
import { buildReportInsights } from '../../src/modules/reporting/application/decision-insights/index.js';
import { parseReportInsightPeriod } from '../../src/modules/reporting/http/schemas/report-insight-period.js';

describe('report decision insights', () => {
  it('turns KPI deviations into traceable actions', () => {
    const insights = buildReportInsights({
      currentRevenue: 70_000, previousRevenue: 100_000, currentExpense: 65_000, previousExpense: 40_000, overdueTotal: 20_000,
      overdueInvoices: [{ id: 'i1', number: 'INV-1', contactId: 'c1', contactName: 'Müşteri', amount: 20_000, dueDate: new Date() }],
      lowStock: [{ productId: 'p1', productCode: 'SKU-1', productName: 'Ürün', quantity: 2, minimum: 10 }],
      decliningProducts: [{ productId: 'p1', productCode: 'SKU-1', productName: 'Ürün', currentRevenue: 10_000, previousRevenue: 30_000 }],
      expenseDrivers: [{ contactId: 'c2', contactName: 'Tedarikçi', currentAmount: 40_000, previousAmount: 15_000 }],
    });
    expect(insights.map((item) => item.category)).toEqual(expect.arrayContaining(['REVENUE', 'EXPENSE', 'COLLECTION', 'STOCK']));
    expect(insights.every((item) => item.action.href.startsWith('/dashboard/') && item.sources.every((source) => source.href.startsWith('/dashboard/')))).toBe(true);
    expect(insights[0]?.severity).toBe('CRITICAL');
  });

  it('does not create noise for stable empty snapshots', () => {
    expect(buildReportInsights({ currentRevenue: 100, previousRevenue: 100, currentExpense: 50, previousExpense: 50, overdueTotal: 0, overdueInvoices: [], lowStock: [], decliningProducts: [], expenseDrivers: [] })).toEqual([]);
  });

  it('includes the complete end date and limits expensive ranges', () => {
    const period = parseReportInsightPeriod('2026-09-01', '2026-09-30');
    expect(period?.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(period?.to.toISOString()).toBe('2026-09-30T23:59:59.999Z');
    expect(parseReportInsightPeriod('2020-01-01', '2026-01-01')).toBeNull();
  });
});
