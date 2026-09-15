import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 6: Production & Shop Floor Schemas
// ─────────────────────────────────────────────

export const WorkOrderStatusEnum = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusEnum>;

export const WorkCenterRefSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});
export type WorkCenterRef = z.infer<typeof WorkCenterRefSchema>;

export const WorkOrderOpSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  workCenterId: z.string(),
  name: z.string(),
  stepOrder: z.number(),
  status: WorkOrderStatusEnum.default('PLANNED'),
  plannedStartAt: z.string().nullable().optional(),
  plannedEndAt: z.string().nullable().optional(),
  actualStartAt: z.string().nullable().optional(),
  actualEndAt: z.string().nullable().optional(),
  plannedSetupTime: z.coerce.number().nullable().optional(),
  plannedRunTime: z.coerce.number().nullable().optional(),
  actualSetupTime: z.coerce.number().nullable().optional(),
  actualRunTime: z.coerce.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  workCenter: WorkCenterRefSchema.optional(),
});
export type WorkOrderOp = z.infer<typeof WorkOrderOpSchema>;

export const WorkOrderItemSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  productId: z.string(),
  requiredQty: z.coerce.number(),
  consumedQty: z.coerce.number().default(0),
  sourceWarehouseId: z.string().nullable().optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .optional(),
});
export type WorkOrderItem = z.infer<typeof WorkOrderItemSchema>;

export const WorkOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  number: z.string(),
  status: WorkOrderStatusEnum.default('PLANNED'),
  productId: z.string(),
  bomId: z.string().nullable().optional(),
  plannedQty: z.coerce.number(),
  producedQty: z.coerce.number().default(0),
  scrapQty: z.coerce.number().default(0),
  scrapReason: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  inputWarehouseId: z.string().nullable().optional(),
  outputWarehouseId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .optional(),
  bom: z
    .object({
      id: z.string(),
      name: z.string(),
      version: z.string(),
    })
    .nullable()
    .optional(),
  operations: z.array(WorkOrderOpSchema).optional(),
  items: z.array(WorkOrderItemSchema).optional(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const WorkOrderListResponseSchema = z.object({
  data: z.array(WorkOrderSchema),
  meta: z
    .object({
      total: z.number().default(0),
      page: z.number().default(1),
      pageSize: z.number().default(20),
      totalPages: z.number().default(1),
    })
    .optional(),
});

export interface WorkOrderListParams {
  page?: number;
  limit?: number;
  status?: WorkOrderStatus;
  search?: string;
}

export interface RecordProductionOutputDTO {
  producedQty: number;
  scrapQty?: number;
  scrapReason?: string;
  operationId?: string;
  notes?: string;
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * 6.3: İş emirleri listesini getirir
 */
export async function getWorkOrders(params?: WorkOrderListParams): Promise<{
  items: WorkOrder[];
  total: number;
}> {
  const queryParams: Record<string, any> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.status) queryParams.status = params.status;

  const res = await apiClient.get('/api/production/work-orders', { params: queryParams });
  const parsed = WorkOrderListResponseSchema.safeParse(res.data);
  if (parsed.success) {
    return {
      items: parsed.data.data,
      total: parsed.data.meta?.total ?? parsed.data.data.length,
    };
  }

  const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
  return { items: rawList, total: res.data?.meta?.total ?? rawList.length };
}

/**
 * 6.3: İş emri detayını operasyon ve malzeme listesiyle getirir
 */
export async function getWorkOrderById(id: string): Promise<WorkOrder> {
  const res = await apiClient.get(`/api/production/work-orders/${id}`);
  const parsed = SingleResponseSchema(WorkOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * 6.3: İş emri durumunu değiştirir (PLANNED -> IN_PROGRESS -> COMPLETED vs.)
 */
export async function changeWorkOrderStatus(
  id: string,
  status: WorkOrderStatus,
  notes?: string
): Promise<WorkOrder> {
  const res = await apiClient.post(`/api/production/work-orders/${id}/status`, {
    status,
    notes: notes?.trim() || undefined,
  });
  const parsed = SingleResponseSchema(WorkOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data ?? res.data;
}

/**
 * 6.3: Üretilen net miktar ve fire miktarını girerek operasyonu raporlar
 */
export async function reportWorkOrderProduction(
  id: string,
  data: RecordProductionOutputDTO
): Promise<any> {
  const payload = {
    producedQty: Math.max(0, data.producedQty),
    scrapQty: data.scrapQty !== undefined ? Math.max(0, data.scrapQty) : 0,
    scrapReason: data.scrapReason?.trim() || undefined,
    operationId: data.operationId || undefined,
    notes: data.notes?.trim() || undefined,
  };

  const res = await apiClient.post(`/api/production/work-orders/${id}/report`, payload);
  return res.data?.data ?? res.data;
}

/**
 * 6.3: Operasyon adımını günceller (başlangıç/bitiş saati, durum)
 */
export async function updateWorkOrderOperation(
  workOrderId: string,
  operationId: string,
  data: {
    status?: WorkOrderStatus;
    actualStartAt?: string | null;
    actualEndAt?: string | null;
    notes?: string | null;
  }
): Promise<WorkOrderOp> {
  const res = await apiClient.patch(
    `/api/production/work-orders/${workOrderId}/operations/${operationId}`,
    data
  );
  const parsed = SingleResponseSchema(WorkOrderOpSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data ?? res.data;
}
