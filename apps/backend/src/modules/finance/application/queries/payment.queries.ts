import { NotFoundError } from '../../../../errors/index.js';
import { parsePageRequest, type PageResult } from '../../../shared/index.js';
import type { PaymentFilters, PaymentReadRepository } from '../ports/payment-read.repository.js';

export interface ListPaymentsQuery extends PaymentFilters {
  page?: string;
  limit?: string;
}

export class PaymentQueries<TListItem extends object, TDetail extends object> {
  constructor(private readonly repository: PaymentReadRepository<TListItem, TDetail>) {}

  list(tenantId: string, query: ListPaymentsQuery): Promise<PageResult<TListItem>> {
    return this.repository.list(tenantId, query, parsePageRequest(query.page, query.limit));
  }

  async getById(tenantId: string, paymentId: string): Promise<TDetail> {
    const payment = await this.repository.findById(tenantId, paymentId);
    if (!payment) throw new NotFoundError('Odeme', paymentId);
    return payment;
  }
}
