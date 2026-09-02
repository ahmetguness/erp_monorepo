export interface SalesProcessDocumentRef {
  id: string;
  number: string;
  status: string;
  occurredAt: Date;
  amount: number | null;
  collectedAmount: number | null;
}

export interface SalesProcessSnapshot {
  order: {
    id: string;
    number: string;
    status: string;
    createdAt: Date;
    dueDate: Date | null;
    totalGross: number;
    orderedQuantity: number;
    deliveredQuantity: number;
  };
  quote: SalesProcessDocumentRef | null;
  deliveryNotes: readonly SalesProcessDocumentRef[];
  invoices: readonly SalesProcessDocumentRef[];
  payments: readonly SalesProcessDocumentRef[];
}

export interface SalesProcessReadRepository {
  findByOrderId(tenantId: string, orderId: string): Promise<SalesProcessSnapshot | null>;
}
