export function mapTrendyolOrderStatus(
  raw: string,
): 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'REFUNDED' {
  // Normalize: trim + lowercase for comparison
  const s = raw.trim();
  const map: Record<string, 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'REFUNDED'> = {
    Awaiting: 'PENDING',
    Created: 'PENDING',
    Picking: 'PROCESSING',
    Invoiced: 'PROCESSING',
    Shipped: 'SHIPPED',
    AtCollectionPoint: 'SHIPPED',
    Delivered: 'DELIVERED',
    Cancelled: 'CANCELLED',
    UnSupplied: 'CANCELLED',
    UnPacked: 'CANCELLED',
    UnDelivered: 'RETURNED',
    Returned: 'RETURNED',
    Repack: 'RETURNED',
    Refunded: 'REFUNDED',
  };
  // Exact match first
  if (map[s]) return map[s];
  // Case-insensitive fallback
  const lower = s.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return v;
  }
  return 'PENDING';
}
