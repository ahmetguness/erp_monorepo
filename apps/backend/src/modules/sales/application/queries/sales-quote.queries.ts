import { parsePageRequest, type PageResult } from '../../../shared/index.js';
import type { SalesQuoteFilters, SalesQuoteReadRepository } from '../ports/sales-quote-read.repository.js';

export interface ListSalesQuotesQuery extends SalesQuoteFilters {
  page?: string;
  limit?: string;
}

export class SalesQuoteQueries<TListItem extends object, TDetail extends object> {
  constructor(private readonly repository: SalesQuoteReadRepository<TListItem, TDetail>) {}

  list(tenantId: string, query: ListSalesQuotesQuery): Promise<PageResult<TListItem>> {
    return this.repository.list(tenantId, query, parsePageRequest(query.page, query.limit));
  }

  getById(tenantId: string, quoteId: string): Promise<TDetail | null> {
    return this.repository.findById(tenantId, quoteId);
  }
}
