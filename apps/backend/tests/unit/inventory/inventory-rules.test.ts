import { CostingMethod } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  parseCostingMethod,
  parseLotSerialPolicy,
  parseNegativeStockPolicy,
  parseReservationPolicy,
  parseStockCountApprovalPolicy,
  quantityValue,
} from '../../../src/modules/inventory/domain/inventory-policy.js';
import {
  determineSalesVelocityTrend,
  determineSuggestionPriority,
} from '../../../src/modules/inventory/domain/replenishment-policy.js';

describe('inventory policies', () => {
  it('parses supported policies and legacy negative stock values', () => {
    expect(parseNegativeStockPolicy('true')).toBe('ALLOW');
    expect(parseNegativeStockPolicy('false')).toBe('BLOCK');
    expect(parseNegativeStockPolicy('invalid')).toBeNull();
    expect(parseReservationPolicy('RESPECT')).toBe('RESPECT');
    expect(parseReservationPolicy('invalid')).toBeNull();
    expect(parseLotSerialPolicy('REQUIRED_FOR_OUT')).toBe('REQUIRED_FOR_OUT');
    expect(parseStockCountApprovalPolicy('REQUIRED_FOR_DIFFERENCE')).toBe('REQUIRED_FOR_DIFFERENCE');
    expect(parseCostingMethod(CostingMethod.FIFO)).toBe(CostingMethod.FIFO);
    expect(parseCostingMethod('invalid')).toBeNull();
    expect(quantityValue(null)).toBe(0);
  });

  it.each([
    [0, 0, 0, 'STABLE'],
    [5, 2, 1, 'ACCELERATING'],
    [1, 2, 5, 'DECELERATING'],
    [5, 5, 5, 'STABLE'],
  ] as const)('classifies sales velocity', (daily30, daily60, daily90, expected) => {
    expect(determineSalesVelocityTrend(daily30, daily60, daily90)).toBe(expected);
  });

  it.each([
    [0, 10, null, 0, 'CRITICAL'],
    [10, 10, 3, 0, 'CRITICAL'],
    [10, 10, 7, 0, 'HIGH'],
    [4, 10, null, 0, 'HIGH'],
    [8, 10, null, 0, 'MEDIUM'],
    [12, 10, null, 0, 'LOW'],
  ] as const)('prioritizes replenishment', (available, minimum, days, ratio, expected) => {
    expect(determineSuggestionPriority(available, minimum, days, ratio)).toBe(expected);
  });
});
