import type { MarketplaceOrderStatus } from '@prisma/client';

export interface WebhookOrderLine {
  contentId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface WebhookOrderPackage {
  packageId: string;
  status: MarketplaceOrderStatus;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  totalAmount: number;
  orderDate: Date;
  lastModifiedDate: string;
  lines: WebhookOrderLine[];
}
