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

export type Reservation = z.infer<typeof ReservationSchema>;
export type ReservationRefType = Reservation['refType'];

export interface CreateReservationDTO {
  productId: string; warehouseId: string; quantity: number;
  refType: ReservationRefType; refId: string; notes?: string; expiresAt?: string;
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
