export interface ApproveInvoiceCommand {
  tenantId: string;
  invoiceId: string;
  userId?: string | null;
  idempotencyKey: string;
}

export interface ApproveInvoiceResult {
  invoiceId: string;
  status: 'SENT';
  journalEntryId: string;
  stockMovementCount: number;
}

export interface InvoiceApprovalRepository {
  approve(command: ApproveInvoiceCommand): Promise<ApproveInvoiceResult>;
}
