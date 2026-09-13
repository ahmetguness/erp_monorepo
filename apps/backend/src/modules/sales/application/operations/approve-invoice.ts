import type { ApproveInvoiceCommand, ApproveInvoiceResult, InvoiceApprovalRepository } from '../ports/invoice-approval.repository.js';

export class ApproveInvoice {
  constructor(private readonly repository: InvoiceApprovalRepository) {}

  execute(command: ApproveInvoiceCommand): Promise<ApproveInvoiceResult> {
    return this.repository.approve(command);
  }
}
