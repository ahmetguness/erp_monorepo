import { describe, expect, it } from 'vitest';
import { buildRecommendation, sanitizeReplenishmentPolicy } from '../../src/modules/procurement/application/replenishment/index.js';

describe('replenishment planning', () => {
  it('aligns the recommendation with MOQ and package size while exposing scenarios', () => {
    const policy = sanitizeReplenishmentPolicy({ lookbackDays: 90, horizonDays: 30, targetServiceLevel: 95, autoCreateDrafts: false, maximumDraftValue: 10_000 });
    const recommendation = buildRecommendation({ productId: 'p1', productCode: 'SKU-1', productName: 'Ürün', purchasePrice: 10, minimumStock: 5, onHand: 4, reserved: 2, incoming: 0, openSales: 3, recentDemand: 30, previousDemand: 30, demandSamples: [1, 2, 1, 2], supplierId: 's1', supplierName: 'Tedarikçi', supplierUnitPrice: 8, supplierLeadTimeDays: 10, supplierReliability: 90, minimumOrderQuantity: 12, packageSize: 6 }, policy);
    expect(recommendation.urgency).toBe('CRITICAL');
    expect(recommendation.scenarios).toHaveLength(3);
    expect(recommendation.scenarios.every((scenario) => scenario.quantity % 6 === 0 && scenario.quantity >= 12)).toBe(true);
  });

  it('keeps invalid tenant policy values inside safe limits', () => {
    expect(sanitizeReplenishmentPolicy({ lookbackDays: 1, horizonDays: 999, targetServiceLevel: 20, autoCreateDrafts: true, maximumDraftValue: -1 })).toEqual({ lookbackDays: 30, horizonDays: 120, targetServiceLevel: 85, autoCreateDrafts: true, maximumDraftValue: 0 });
  });
});
