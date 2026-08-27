import type { PageRequest, PageResult } from '../../../shared/index.js';

export interface PaymentFilters {
  contactId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaymentReadRepository<TListItem extends object, TDetail extends object> {
  list(tenantId: string, filters: PaymentFilters, page: PageRequest): Promise<PageResult<TListItem>>;
  findById(tenantId: string, paymentId: string): Promise<TDetail | null>;
}
