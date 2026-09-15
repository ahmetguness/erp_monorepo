import { describe, expect, it } from 'vitest';
import {
  executiveDashboardSchema,
  procurementDashboardSchema,
  productionDashboardSchema,
} from '../../src/features/basic-dashboard/api/basic-dashboard.schemas';

describe('basic dashboard contracts', () => {
  it('accepts the executive dashboard contract', () => {
    const parsed = executiveDashboardSchema.parse({
      sales: { today: 100, currentMonth: 500, previousMonth: 450, trend: [] },
      receivables: { total: 300, overdue: 50, dueSoon: 75 },
      cash: { bank: 200, cash: 100, total: 300 },
      inventory: { lowStockCount: 2 },
      salesOrders: { openCount: 3, openAmount: 800 },
      generatedAt: new Date(0).toISOString(),
    });
    expect(parsed.cash.total).toBe(300);
  });

  it('accepts production and procurement dashboard contracts', () => {
    expect(
      productionDashboardSchema.parse({
        workOrders: { openByStatus: { PLANNED: 1 }, overdue: 0 },
        output: { planned: 10, produced: 4 },
        scrap: { quantity: 1, producedQuantity: 4, rate: 20 },
        workCenters: [],
        generatedAt: new Date(0).toISOString(),
      }).output.produced,
    ).toBe(4);
    expect(
      procurementDashboardSchema.parse({
        openOrders: { count: 1, amount: 250 },
        overdueDeliveries: 0,
        upcomingDeliveries: [],
        generatedAt: new Date(0).toISOString(),
      }).openOrders.count,
    ).toBe(1);
  });
});
