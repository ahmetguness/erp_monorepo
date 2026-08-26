import type { PageRequest, PageResult } from '../../../shared/application/pagination.js';

export interface PayrollFilters {
  period?: string;
  employeeId?: string;
}

export interface PayrollReadRepository<TListItem extends object, TDetail extends object> {
  list(tenantId: string, filters: PayrollFilters, page: PageRequest): Promise<PageResult<TListItem>>;
  findById(tenantId: string, payrollId: string): Promise<TDetail | null>;
}
