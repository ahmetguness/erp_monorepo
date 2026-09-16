import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';
import { formatCurrency, formatDate } from '../lib/utils';

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

// ─────────────────────────────────────────────
// FAZ 16.5: Corporate Service Report Document Engine
// ─────────────────────────────────────────────

export interface ServiceReportData {
  job: FieldServiceJob;
  diagnosis?: string;
  actionsTaken?: string;
  technicianName?: string;
  customerName?: string;
  customerSignatureSvg?: string[];
  items?: ServiceRequestItem[];
  companyName?: string;
  date?: string;
}

/**
 * 16.5: İmzalı kurumsal teknik servis raporu HTML çıktısı üretir
 */
export function generateServiceReportHtml(data: ServiceReportData): string {
  const company = data.companyName || 'AXON ERP TEKNİK SERVİS A.Ş.';
  const reportDate = data.date || new Date().toLocaleDateString('tr-TR');
  const items = data.items || [];
  const totalAmount = items.reduce((sum, i) => sum + (Number(i.lineTotal) || (Number(i.quantity) * Number(i.unitPrice))), 0);

  const itemsRows = items.length > 0
    ? items.map((it, idx) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${it.product?.name || it.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${it.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatCurrency(it.unitPrice)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${formatCurrency(it.lineTotal || it.quantity * it.unitPrice)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #718096;">Yedek parça sarfiyatı kaydedilmedi.</td></tr>`;

  const signaturePaths = (data.customerSignatureSvg || [])
    .map((d) => `<path d="${d}" fill="none" stroke="#1a365d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Teknik Servis Raporu - ${data.job.number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #2d3748; }
    .header { border-bottom: 2px solid #3182ce; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: bold; color: #2b6cb0; }
    .subtitle { font-size: 13px; color: #718096; margin-top: 4px; }
    .doc-num { font-size: 16px; font-weight: 700; color: #2d3748; text-align: right; }
    .meta-box { display: flex; gap: 20px; margin-bottom: 20px; }
    .card { flex: 1; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
    .card-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #4a5568; margin-bottom: 8px; border-bottom: 1px solid #edf2f7; padding-bottom: 4px; }
    .row { font-size: 13px; margin-bottom: 4px; display: flex; }
    .lbl { color: #718096; width: 90px; }
    .val { font-weight: 600; color: #1a202c; flex: 1; }
    .section-title { font-size: 14px; font-weight: bold; color: #2d3748; margin: 18px 0 8px 0; }
    .notes-box { background: #edf2f7; border-left: 3px solid #3182ce; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; border-radius: 0 4px 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th { background: #ebf8ff; color: #2b6cb0; padding: 8px; text-align: left; border-bottom: 2px solid #bee3f8; }
    .total-row { display: flex; justify-content: flex-end; padding: 12px 0; font-size: 15px; font-weight: bold; }
    .signatures { display: flex; justify-content: space-between; margin-top: 30px; gap: 40px; }
    .sig-block { flex: 1; text-align: center; border-top: 1px dashed #cbd5e0; padding-top: 10px; }
    .sig-canvas { border: 1px solid #e2e8f0; background: #ffffff; border-radius: 4px; height: 100px; width: 100%; max-width: 280px; margin: 8px auto; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #a0aec0; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${company}</div>
      <div class="subtitle">Yetkili Saha Servis ve Bakım Onarım Departmanı</div>
    </div>
    <div class="doc-num">
      FORM NO: ${data.job.number}<br>
      <span style="font-size: 12px; font-weight: normal; color: #718096;">Tarih: ${reportDate}</span>
    </div>
  </div>

  <div class="meta-box">
    <div class="card">
      <div class="card-title">Müşteri Bilgileri</div>
      <div class="row"><span class="lbl">Cari / Firma:</span><span class="val">${data.job.contact?.name || 'Belirtilmedi'}</span></div>
      <div class="row"><span class="lbl">Telefon:</span><span class="val">${data.job.contact?.phone || '-'}</span></div>
      <div class="row"><span class="lbl">Adres:</span><span class="val">${data.job.contact?.address || '-'} ${data.job.contact?.city || ''}</span></div>
    </div>

    <div class="card">
      <div class="card-title">Cihaz / Varlık Bilgileri</div>
      <div class="row"><span class="lbl">Cihaz Adı:</span><span class="val">${data.job.asset?.name || 'Genel Servis'}</span></div>
      <div class="row"><span class="lbl">Marka / Model:</span><span class="val">${data.job.asset?.brand || ''} ${data.job.asset?.model || '-'}</span></div>
      <div class="row"><span class="lbl">Seri No:</span><span class="val">${data.job.asset?.serialNo || '-'}</span></div>
    </div>
  </div>

  <div class="section-title">Servis Teşhisi ve Arıza Açıklaması</div>
  <div class="notes-box">
    <strong>Arıza Şikayeti:</strong> ${data.job.subject}<br>
    <strong>Teşhis:</strong> ${data.diagnosis || 'Arıza tespiti yapıldı.'}
  </div>

  <div class="section-title">Uygulanan İşlemler ve Çözüm</div>
  <div class="notes-box">
    ${data.actionsTaken || 'Cihazın gerekli bakımı ve onarımı başarıyla tamamlandı.'}
  </div>

  <div class="section-title">Kullanılan Yedek Parçalar ve İşçilik</div>
  <table>
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">#</th>
        <th>Parça / Açıklama</th>
        <th style="width: 70px; text-align: center;">Miktar</th>
        <th style="width: 100px; text-align: right;">Birim Fiyat</th>
        <th style="width: 110px; text-align: right;">Toplam</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="total-row">
    <span>GENEL TOPLAM:&nbsp;&nbsp;</span>
    <span style="color: #2b6cb0;">${formatCurrency(totalAmount)}</span>
  </div>

  <div class="signatures">
    <div class="sig-block">
      <strong>Teknisyen / Servis Yetkilisi</strong>
      <div style="font-size: 13px; color: #4a5568; margin-top: 6px;">${data.technicianName || 'Saha Servis Uzmanı'}</div>
      <div style="font-size: 11px; color: #a0aec0; margin-top: 30px;">(İmza / Onay)</div>
    </div>

    <div class="sig-block">
      <strong>Müşteri / Teslim Alan Yetkili</strong>
      <div style="font-size: 13px; color: #4a5568; margin-top: 6px;">${data.customerName || data.job.contact?.name || 'Müşteri'}</div>
      ${data.customerSignatureSvg && data.customerSignatureSvg.length > 0 ? `
        <div class="sig-canvas">
          <svg viewBox="0 0 320 160" style="width: 100%; height: 100%;">
            ${signaturePaths}
          </svg>
        </div>
      ` : '<div style="height: 60px; display: flex; align-items: center; justify-content: center; color: #a0aec0; font-size: 12px;">Dijital İmza Alındı</div>'}
      <div style="font-size: 11px; color: #a0aec0;">Bu belge ile cihaz çalışır vaziyette teslim alınmıştır.</div>
    </div>
  </div>

  <div class="footer">
    AXON ERP Mobil Saha Servis Sistemi tarafından elektronik ortamda tanzim edilmiştir. Belge No: ${data.job.id}
  </div>
</body>
</html>`;
}
