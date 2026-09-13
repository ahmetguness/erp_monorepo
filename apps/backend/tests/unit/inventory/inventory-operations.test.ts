import { describe,expect,it } from 'vitest';
import {
  parseConfirmGoodsReceipt,
  parseRecordStockMovement,
  parseReleaseReservation,
  parseReserveStock,
} from '../../../src/modules/inventory/application/operations/index.js';

describe('inventory application operation validation', () => {
  it('builds a type-safe stock movement command', () => {
    expect(parseRecordStockMovement({
      idempotencyKey: 'movement-1',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      type: 'IN',
      quantity: 3,
    })).toMatchObject({ type: 'IN', quantity: 3 });
    expect(() => parseRecordStockMovement(null)).toThrow();
    expect(() => parseRecordStockMovement({ type: 'INVALID' })).toThrow();
    expect(() => parseRecordStockMovement({
      idempotencyKey: 'movement-transfer',
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      type: 'TRANSFER',
      quantity: 3,
    })).toThrow();
  });

  it('validates reservation quantities, references and dates', () => {
    expect(parseReserveStock({
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      quantity: 2,
      refType: 'SALES_ORDER',
      refId: 'order-1',
    })).toMatchObject({ quantity: 2, refType: 'SALES_ORDER' });
    expect(() => parseReserveStock({ quantity: 0 })).toThrow();
    expect(() => parseReserveStock({ expiresAt: 'not-a-date' })).toThrow();
  });

  it('accepts an idempotent release command', () => {
    expect(parseReleaseReservation('reservation-1')).toEqual({ reservationId: 'reservation-1' });
    expect(() => parseReleaseReservation('')).toThrow();
  });

  it('rejects duplicate and invalid goods receipt lines', () => {
    const valid = {
      idempotencyKey: 'receipt-1',
      warehouseId: 'warehouse-1',
      items: [{ itemId: 'item-1', receivedQty: 1 }],
    };
    expect(parseConfirmGoodsReceipt('order-1', valid)).toMatchObject({ purchaseOrderId: 'order-1' });
    expect(() => parseConfirmGoodsReceipt('order-1', {
      ...valid,
      items: [{ itemId: 'item-1', receivedQty: 1 }, { itemId: 'item-1', receivedQty: 1 }],
    })).toThrow();
    expect(() => parseConfirmGoodsReceipt('order-1', null)).toThrow();
  });
});
