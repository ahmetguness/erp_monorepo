import { NotFoundError } from '../../../../errors/index.js';
import type { WorkOrderListQuery, WorkOrderReadRepository } from '../ports/work-order-read.repository.js';

export class WorkOrderQueries<TListItem, TDetail> {
  constructor(private readonly repository: WorkOrderReadRepository<TListItem, TDetail>) {}

  async list(query: WorkOrderListQuery) {
    const result = await this.repository.list(query);
    return {
      data: result.items,
      meta: {
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  async detail(tenantId: string, workOrderId: string) {
    const workOrder = await this.repository.findDetail(tenantId, workOrderId);
    if (!workOrder) throw new NotFoundError('İş Emri', workOrderId);
    return workOrder;
  }
}
