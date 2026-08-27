import { NotFoundError } from '../../../../errors/index.js';
import type { PageRequest, PageResult } from '../../../shared/index.js';
import type { PayrollFilters, PayrollReadRepository } from '../ports/payroll-read.repository.js';

export class PayrollQueries<TListItem extends object, TDetail extends object> {
  constructor(private readonly repository: PayrollReadRepository<TListItem, TDetail>) {}

  list(tenantId: string, filters: PayrollFilters, page: PageRequest): Promise<PageResult<TListItem>> {
    return this.repository.list(tenantId, filters, page);
  }

  async getById(tenantId: string, payrollId: string): Promise<TDetail> {
    const payroll = await this.repository.findById(tenantId, payrollId);
    if (!payroll) throw new NotFoundError('Bordro', payrollId);
    return payroll;
  }
}
