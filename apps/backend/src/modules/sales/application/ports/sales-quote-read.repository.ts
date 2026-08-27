import type { PageRequest, PageResult } from '../../../shared/index.js';

export interface SalesQuoteFilters {
  status?: string;
  contactId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SalesQuoteReadRepository<TListItem extends object, TDetail extends object> {
  list(tenantId: string, filters: SalesQuoteFilters, page: PageRequest): Promise<PageResult<TListItem>>;
  findById(tenantId: string, quoteId: string): Promise<TDetail | null>;
}
