import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const ProductRef = z.object({ id: z.string(), code: z.string(), name: z.string() });
const WarehouseRef = z.object({ id: z.string(), name: z.string() });

export const ReservationSchema = z.object({
  id: z.string(), tenantId: z.string(), productId: z.string(), warehouseId: z.string(),
  quantity: z.coerce.number(),
  refType: z.enum(['SALES_ORDER', 'WORK_ORDER', 'PURCHASE_REQUEST', 'OTHER']),
  refId: z.string(), notes: z.string().nullable().optional(),
  reservedAt: z.string(), releasedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  product: ProductRef.optional(), warehouse: WarehouseRef.optional(),
});

export const SalesOrderReservationLineResultSchema = z.object({
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  requestedQuantity: z.coerce.number(),
  alreadyReservedQuantity: z.coerce.number(),
  reservedQuantity: z.coerce.number(),
  availableBeforeReservation: z.coerce.number(),
  status: z.enum(['FULL', 'PARTIAL', 'SKIPPED']),
});

export const SalesOrderReservationResultSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  warehouseId: z.string(),
  warehouseName: z.string(),
  allowPartial: z.boolean(),
  createdCount: z.coerce.number(),
  totalReservedQuantity: z.coerce.number(),
  lines: z.array(SalesOrderReservationLineResultSchema),
});

export const ReservationReportSchema = z.object({
  generatedAt: z.string(),
  summary: z.object({
    activeQuantity: z.coerce.number(),
    expiredQuantity: z.coerce.number(),
    releasedQuantity: z.coerce.number(),
    totalQuantity: z.coerce.number(),
    activeCount: z.coerce.number(),
    expiredCount: z.coerce.number(),
    releasedCount: z.coerce.number(),
  }),
  rows: z.array(z.object({
    productId: z.string(),
    productCode: z.string(),
    productName: z.string(),
    warehouseId: z.string(),
    warehouseName: z.string(),
    activeQuantity: z.coerce.number(),
    expiredQuantity: z.coerce.number(),
    releasedQuantity: z.coerce.number(),
    totalQuantity: z.coerce.number(),
    activeCount: z.coerce.number(),
    expiredCount: z.coerce.number(),
    releasedCount: z.coerce.number(),
    earliestExpiry: z.string().nullable(),
    latestReservedAt: z.string().nullable(),
  })),
});

export const ExpiredReservationReleaseResultSchema = z.object({
  releasedCount: z.coerce.number(),
  releasedAt: z.string(),
});

export type Reservation = z.infer<typeof ReservationSchema>;
export type ReservationRefType = Reservation['refType'];
export type SalesOrderReservationResult = z.infer<typeof SalesOrderReservationResultSchema>;
export type ReservationReport = z.infer<typeof ReservationReportSchema>;
export type ExpiredReservationReleaseResult = z.infer<typeof ExpiredReservationReleaseResultSchema>;

export interface CreateReservationDTO {
  productId: string; warehouseId: string; quantity: number;
  refType: ReservationRefType; refId: string; notes?: string; expiresAt?: string; allowPartial?: boolean;
}

export interface CreateSalesOrderReservationDTO {
  orderId: string;
  warehouseId: string;
  allowPartial?: boolean;
  expiresAt?: string;
}

export interface ListParams extends PaginationParams { productId?: string; warehouseId?: string; refType?: string; active?: string }

export async function getReservations(params: ListParams) {
  const res = await apiClient.get('/api/inventory-reservations', { params });
  return safeParse(PaginatedResponseSchema(ReservationSchema), res.data, 'getReservations');
}

export async function createReservation(data: CreateReservationDTO): Promise<Reservation> {
  const res = await apiClient.post('/api/inventory-reservations', data);
  return safeParse(SingleResponseSchema(ReservationSchema), res.data, 'createReservation').data;
}

export async function releaseReservation(id: string): Promise<Reservation> {
  const res = await apiClient.post(`/api/inventory-reservations/${id}/release`);
  return safeParse(SingleResponseSchema(ReservationSchema), res.data, 'releaseReservation').data;
}

export async function createReservationsFromSalesOrder(data: CreateSalesOrderReservationDTO): Promise<SalesOrderReservationResult> {
  const res = await apiClient.post('/api/inventory-reservations/from-sales-order', data);
  return safeParse(SingleResponseSchema(SalesOrderReservationResultSchema), res.data, 'createReservationsFromSalesOrder').data;
}

export async function getReservationReport(): Promise<ReservationReport> {
  const res = await apiClient.get('/api/inventory-reservations/report');
  return safeParse(SingleResponseSchema(ReservationReportSchema), res.data, 'getReservationReport').data;
}

export async function releaseExpiredReservations(): Promise<ExpiredReservationReleaseResult> {
  const res = await apiClient.post('/api/inventory-reservations/release-expired');
  return safeParse(SingleResponseSchema(ExpiredReservationReleaseResultSchema), res.data, 'releaseExpiredReservations').data;
}
