import { describe, expect, it } from 'vitest';
import { compareSupplierQuotes } from '../../src/components/features/purchase/purchase-quote-comparison';
import type { PurchaseRequest } from '../../src/services/purchase.service';

const request = {
  items: [
    { id: 'i1', productId: 'p1', quantity: 3, unitPrice: 10 },
    { id: 'i2', productId: 'p2', quantity: 2, unitPrice: 20 },
  ],
} as PurchaseRequest;

describe('purchase quote comparison', () => {
  it('calculates totals and recommends the strongest weighted quote', () => {
    const results = compareSupplierQuotes(request, [
      { contactId: 's1', prices: { p1: '10', p2: '20' }, leadTimeDays: '10', qualityScore: '80' },
      { contactId: 's2', prices: { p1: '11', p2: '21' }, leadTimeDays: '5', qualityScore: '95' },
    ]);
    expect(results.map((result) => result.total)).toEqual([70, 75]);
    expect(results.every((result) => result.isComplete)).toBe(true);
    expect(results.filter((result) => result.isRecommended)).toHaveLength(1);
    expect(results[1].isRecommended).toBe(true);
  });

  it('does not allow missing, zero or negative prices to produce an order candidate', () => {
    const results = compareSupplierQuotes(request, [
      { contactId: 's1', prices: { p1: '10' }, leadTimeDays: '10', qualityScore: '80' },
      { contactId: 's2', prices: { p1: '-1', p2: '20' }, leadTimeDays: '0', qualityScore: '120' },
    ]);
    expect(results.every((result) => !result.isComplete && !result.isRecommended)).toBe(true);
  });
});
