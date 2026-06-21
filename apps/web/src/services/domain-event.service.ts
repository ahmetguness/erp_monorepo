import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

export const DomainEventStatusSchema = z.enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER']);
export const DomainEventEntityTypeSchema = z.enum([
  'INVOICE',
  'PRODUCT',
  'CATEGORY',
  'CONTACT',
  'EMPLOYEE',
  'CUSTOMER_ASSET',
  'SERVICE_REQUEST',
  'PURCHASE_ORDER',
  'SALES_QUOTE',
  'SALES_ORDER',
  'WORK_ORDER',
  'DELIVERY_NOTE',
  'OTHER',
]);

export const DomainEventOutboxSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  schemaVersion: z.number(),
  source: z.string(),
  idempotencyKey: z.string(),
  entityType: DomainEventEntityTypeSchema,
  entityId: z.string(),
  payload: z.unknown(),
  context: z.unknown(),
  status: DomainEventStatusSchema,
  attempts: z.number(),
  lastError: z.string().nullable(),
  failedListeners: z.unknown().nullable(),
  nextRetryAt: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DomainEventReplayResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  beforeStatus: DomainEventStatusSchema,
  afterStatus: DomainEventStatusSchema,
  attempts: z.number(),
  replayed: z.boolean(),
  message: z.string(),
});

export type DomainEventStatus = z.infer<typeof DomainEventStatusSchema>;
export type DomainEventOutbox = z.infer<typeof DomainEventOutboxSchema>;
export type DomainEventReplayResult = z.infer<typeof DomainEventReplayResultSchema>;

export interface DomainEventParams extends PaginationParams {
  status?: DomainEventStatus;
  name?: string;
  entityId?: string;
}

export async function getDomainEventFailures(params: Omit<DomainEventParams, 'status'>) {
  const res = await apiClient.get('/api/domain-events/failures', { params });
  return safeParse(PaginatedResponseSchema(DomainEventOutboxSchema), res.data, 'getDomainEventFailures');
}

export async function replayDomainEvent(id: string): Promise<DomainEventReplayResult> {
  const res = await apiClient.post(`/api/domain-events/${id}/replay`);
  return safeParse(SingleResponseSchema(DomainEventReplayResultSchema), res.data, 'replayDomainEvent').data;
}
