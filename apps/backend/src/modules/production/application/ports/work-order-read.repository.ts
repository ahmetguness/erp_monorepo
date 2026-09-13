import type { WorkOrderStatus } from '../../domain/index.js';

export interface WorkOrderListQuery {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: WorkOrderStatus;
}

export interface WorkOrderReadRepository<TListItem, TDetail> {
  list(query: WorkOrderListQuery): Promise<{ items: TListItem[]; total: number }>;
  findDetail(tenantId: string, workOrderId: string): Promise<TDetail | null>;
}
