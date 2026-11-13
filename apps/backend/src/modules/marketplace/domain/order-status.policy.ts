import type { MarketplaceOrderStatus } from '@prisma/client';

const transitions: Readonly<Record<MarketplaceOrderStatus, readonly MarketplaceOrderStatus[]>> = {
  PENDING: ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'],
  PROCESSING: ['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'],
  SHIPPED: ['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'],
  DELIVERED: ['DELIVERED', 'RETURNED', 'REFUNDED'],
  CANCELLED: ['CANCELLED', 'REFUNDED'],
  RETURNED: ['RETURNED', 'REFUNDED'],
  REFUNDED: ['REFUNDED'],
};

/** Delivery can be followed by a return/refund, but a delayed fulfillment event cannot reopen it. */
export function canAdvanceMarketplaceOrder(current: MarketplaceOrderStatus, incoming: MarketplaceOrderStatus): boolean {
  return transitions[current].includes(incoming);
}
