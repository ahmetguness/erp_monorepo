import { createHash } from 'node:crypto';

interface PurchasePreviewLine {
  productId: string;
  code: string;
  name: string;
  quantity: number;
  minStockLevel: number;
  suggestedQuantity: number;
  purchasePrice: number;
}

/** Bind approval to the displayed catalog/stock snapshot, independent of query row ordering. */
export function fingerprintPurchasePreview(items: readonly PurchasePreviewLine[]): string {
  const snapshot = [...items].sort((left, right) => left.productId.localeCompare(right.productId)).map((item) => ({
    productId: item.productId, code: item.code, name: item.name, quantity: item.quantity,
    minStockLevel: item.minStockLevel, suggestedQuantity: item.suggestedQuantity, purchasePrice: item.purchasePrice,
  }));
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
