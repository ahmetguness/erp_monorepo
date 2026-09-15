import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 6: Field Service Schemas & Types
// ─────────────────────────────────────────────

export const ServiceStatusEnum = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'WAITING_CUSTOMER',
  'COMPLETED',
  'CANCELLED',
]);
export type ServiceStatus = z.infer<typeof ServiceStatusEnum>;

export const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT']);
export type Priority = z.infer<typeof PriorityEnum>;

export const FieldServiceStepStatusEnum = z.enum(['complete', 'pending', 'blocked']);
export type FieldServiceStepStatus = z.infer<typeof FieldServiceStepStatusEnum>;

export const FieldServiceStepSchema = z.object({
  key: z.enum([
    'assignment',
    'route',
    'photos',
    'signature',
    'service_form',
    'customer_approval',
  ]),
  label: z.string(),
  status: FieldServiceStepStatusEnum,
  detail: z.string(),
});
export type FieldServiceStep = z.infer<typeof FieldServiceStepSchema>;

export const FieldServiceContactRefSchema = z.object({
  id: z.string(),
  code: z.string().nullable().optional(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});
export type FieldServiceContactRef = z.infer<typeof FieldServiceContactRefSchema>;

export const FieldServiceAssetRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNo: z.string().nullable().optional(),
});
export type FieldServiceAssetRef = z.infer<typeof FieldServiceAssetRefSchema>;

export const FieldServiceRouteStopSchema = z.object({
  serviceRequestId: z.string(),
  serviceRequestNumber: z.string(),
  sequence: z.number(),
  title: z.string(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
});
export type FieldServiceRouteStop = z.infer<typeof FieldServiceRouteStopSchema>;

export const FieldServiceJobSchema = z.object({
  id: z.string(),
  number: z.string(),
  subject: z.string(),
  status: ServiceStatusEnum,
  priority: PriorityEnum,
  assignedToId: z.string().nullable().optional(),
  contact: FieldServiceContactRefSchema.nullable().optional(),
  asset: FieldServiceAssetRefSchema.nullable().optional(),
  createdAt: z.string(),
  routeStop: FieldServiceRouteStopSchema,
  photoCount: z.number().default(0),
  signatureCount: z.number().default(0),
  serviceFormSubmitted: z.boolean().default(false),
  customerApproved: z.boolean().default(false),
  offlineReady: z.boolean().default(false),
  pendingSyncCount: z.number().default(0),
  lastOfflineSyncAt: z.string().nullable().optional(),
  steps: z.array(FieldServiceStepSchema).default([]),
  href: z.string().optional(),
});
export type FieldServiceJob = z.infer<typeof FieldServiceJobSchema>;

export const FieldServiceSummarySchema = z.object({
  totalJobs: z.number().default(0),
  assignedJobCount: z.number().default(0),
  routeReadyCount: z.number().default(0),
  photoReadyCount: z.number().default(0),
  signatureReadyCount: z.number().default(0),
  formSubmittedCount: z.number().default(0),
  customerApprovedCount: z.number().default(0),
  offlineReadyCount: z.number().default(0),
  pendingSyncCount: z.number().default(0),
});
export type FieldServiceSummary = z.infer<typeof FieldServiceSummarySchema>;

export const FieldServiceFlowResponseSchema = z.object({
  summary: FieldServiceSummarySchema,
  route: z.array(FieldServiceRouteStopSchema),
  jobs: z.array(FieldServiceJobSchema),
});
export type FieldServiceFlowResponse = z.infer<typeof FieldServiceFlowResponseSchema>;

export const ServiceRequestItemSchema = z.object({
  id: z.string().optional(),
  serviceRequestId: z.string().optional(),
  productId: z.string().nullable().optional(),
  description: z.string(),
  quantity: z.coerce.number().default(1),
  unitPrice: z.coerce.number().default(0),
  lineTotal: z.coerce.number().default(0),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      barcode: z.string().nullable().optional(),
    })
    .optional(),
});
export type ServiceRequestItem = z.infer<typeof ServiceRequestItemSchema>;

export const ServiceActivitySchema = z.object({
  id: z.string(),
  serviceRequestId: z.string(),
  activityType: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ServiceActivity = z.infer<typeof ServiceActivitySchema>;

export const ServiceRequestDetailSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: ServiceStatusEnum,
  subject: z.string(),
  description: z.string().nullable().optional(),
  priority: PriorityEnum,
  contactId: z.string().nullable().optional(),
  customerAssetId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  contact: FieldServiceContactRefSchema.nullable().optional(),
  customerAsset: FieldServiceAssetRefSchema.nullable().optional(),
  items: z.array(ServiceRequestItemSchema).optional(),
  activities: z.array(ServiceActivitySchema).optional(),
});
export type ServiceRequestDetail = z.infer<typeof ServiceRequestDetailSchema>;

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * 6.1: Mobil saha servis akışını (atanan çağrılar, rota, durumlar) getirir
 */
export async function getFieldServiceFlow(assignedToId?: string): Promise<FieldServiceFlowResponse> {
  const params: Record<string, any> = {};
  if (assignedToId) params.assignedToId = assignedToId;

  const res = await apiClient.get('/api/service/mobile-flow', { params });
  const parsed = SingleResponseSchema(FieldServiceFlowResponseSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }

  // Fallback direct format
  if (res.data?.data) {
    return res.data.data;
  }
  return {
    summary: {
      totalJobs: 0,
      assignedJobCount: 0,
      routeReadyCount: 0,
      photoReadyCount: 0,
      signatureReadyCount: 0,
      formSubmittedCount: 0,
      customerApprovedCount: 0,
      offlineReadyCount: 0,
      pendingSyncCount: 0,
    },
    route: [],
    jobs: [],
  };
}

/**
 * 6.1: Servis talebinin tam detayını kalemler ve aktivitelerle getirir
 */
export async function getServiceRequestById(id: string): Promise<ServiceRequestDetail> {
  const res = await apiClient.get(`/api/service/requests/${id}`);
  const parsed = SingleResponseSchema(ServiceRequestDetailSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * 6.1: Servis durumu güncelleme ("Yola Çıktı", "Müdahale Başladı", "Parça Bekleniyor", "Tamamlandı")
 */
export async function updateServiceRequestStatus(
  id: string,
  status: ServiceStatus,
  notes?: string
): Promise<any> {
  const res = await apiClient.post(`/api/service/requests/${id}/status`, {
    status,
    notes: notes?.trim() || undefined,
  });
  return res.data?.data ?? res.data;
}

/**
 * 6.2: Servise sarf edilen yedek parça ve işçilik kalemi ekler
 */
export async function addServiceItem(
  serviceRequestId: string,
  data: {
    productId?: string;
    description: string;
    quantity: number;
    unitPrice?: number;
  }
): Promise<ServiceRequestItem> {
  const payload = {
    productId: data.productId || undefined,
    description: data.description.trim(),
    quantity: Math.max(1, data.quantity),
    unitPrice: data.unitPrice ? Math.max(0, data.unitPrice) : 0,
  };

  const res = await apiClient.post(`/api/service/requests/${serviceRequestId}/items`, payload);
  const parsed = SingleResponseSchema(ServiceRequestItemSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data ?? res.data;
}

/**
 * 6.2: Saha servis kontrol noktası (Servis formu, müşteri onayı veya ziyaret notu)
 */
export async function createFieldCheckpoint(
  serviceRequestId: string,
  kind: 'SERVICE_FORM' | 'CUSTOMER_APPROVAL' | 'VISIT_NOTE',
  data?: {
    note?: string;
    customerName?: string;
  }
): Promise<{ id: string }> {
  const payload = {
    kind,
    note: data?.note?.trim() || undefined,
    customerName: data?.customerName?.trim() || undefined,
  };

  const res = await apiClient.post(
    `/api/service/mobile-flow/${serviceRequestId}/checkpoint`,
    payload
  );
  return res.data?.data ?? res.data;
}
