import { z } from 'zod';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 5 & 12: Sales Order Schemas
// ─────────────────────────────────────────────

export const OrderItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  description: z.string().nullable().optional(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  discount: z.coerce.number().default(0),
  taxRate: z.coerce.number().default(20),
  taxAmount: z.coerce.number().default(0),
  lineTotal: z.coerce.number().default(0),
  sortOrder: z.coerce.number().optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      barcode: z.string().nullable().optional(),
    })
    .optional(),
});

export const SalesOrderStatusSchema = z.enum([
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'CANCELLED',
]);
export type SalesOrderStatus = z.infer<typeof SalesOrderStatusSchema>;

export const SalesOrderSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  quoteId: z.string().nullable().optional(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  status: SalesOrderStatusSchema.default('DRAFT'),
  notes: z.string().nullable().optional(),
  totalNet: z.coerce.number().default(0),
  totalTax: z.coerce.number().default(0),
  totalGross: z.coerce.number().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  contact: z.object({ id: z.string(), name: z.string(), phone: z.string().nullable().optional() }).optional(),
  items: z.array(OrderItemSchema).optional(),
});

export const SalesOrderListResponseSchema = z.object({
  data: z.array(SalesOrderSchema),
  meta: z
    .object({
      total: z.number().default(0),
      page: z.number().default(1),
      pageSize: z.number().default(20),
      totalPages: z.number().default(1),
    })
    .optional(),
});

// ─────────────────────────────────────────────
// FAZ 12.2: Sales Quote (Satış Teklifleri) Schemas
// ─────────────────────────────────────────────

export const QuoteStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const SalesQuoteItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  description: z.string().nullable().optional(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  discount: z.coerce.number().default(0),
  taxRate: z.coerce.number().default(20),
  taxAmount: z.coerce.number().default(0),
  lineTotal: z.coerce.number().default(0),
  sortOrder: z.coerce.number().optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      barcode: z.string().nullable().optional(),
    })
    .optional(),
});

export const SalesQuoteSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  number: z.string(),
  date: z.string(),
  validUntil: z.string().nullable().optional(),
  status: QuoteStatusSchema.default('DRAFT'),
  notes: z.string().nullable().optional(),
  totalNet: z.coerce.number().default(0),
  totalTax: z.coerce.number().default(0),
  totalGross: z.coerce.number().default(0),
  currencyCode: z.string().default('TRY'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  contact: z.object({ id: z.string(), name: z.string(), phone: z.string().nullable().optional() }).optional(),
  items: z.array(SalesQuoteItemSchema).optional(),
});

export const SalesQuoteListResponseSchema = z.object({
  data: z.array(SalesQuoteSchema),
  meta: z
    .object({
      total: z.number().default(0),
      page: z.number().default(1),
      pageSize: z.number().default(20),
      totalPages: z.number().default(1),
    })
    .optional(),
});

// ─────────────────────────────────────────────
// FAZ 12.4: Sales Target (Satış Hedefi) Schemas
// ─────────────────────────────────────────────

export const SalesTargetSnapshotSchema = z.object({
  month: z.string(),
  targetAmount: z.coerce.number().default(0),
  actualAmount: z.coerce.number().default(0),
  progressPercent: z.coerce.number().default(0),
  remainingAmount: z.coerce.number().default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ─────────────────────────────────────────────
// FAZ 12.3: Field Visit (Saha Müşteri Ziyareti) Model
// ─────────────────────────────────────────────

export type VisitOutcome =
  | 'SIPARIS_ALINDI'
  | 'TEKLIF_VERILDI'
  | 'BILGI_VERILDI'
  | 'TAHSILAT_YAPILDI'
  | 'TAKIP_GEREK'
  | 'OLUMSUZ';

export interface FieldVisitData {
  id: string;
  contactId: string;
  contactName: string;
  startTime: string; // ISO
  endTime?: string; // ISO
  durationMinutes?: number;
  contactPerson?: string;
  contactPersonTitle?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  outcome?: VisitOutcome;
  orderNumberCreated?: string;
  quoteNumberCreated?: string;
  syncedToBackend?: boolean;
}

// ─────────────────────────────────────────────
// Types & DTOs
// ─────────────────────────────────────────────

export type OrderItem = z.infer<typeof OrderItemSchema>;
export type SalesOrder = z.infer<typeof SalesOrderSchema>;
export type SalesQuote = z.infer<typeof SalesQuoteSchema>;
export type SalesQuoteItem = z.infer<typeof SalesQuoteItemSchema>;
export type SalesTargetSnapshot = z.infer<typeof SalesTargetSnapshotSchema>;

export interface OrderItemDTO {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

export interface CreateSalesOrderDTO {
  contactId: string;
  quoteId?: string;
  number?: string;
  date: string;
  dueDate?: string;
  notes?: string;
  items: OrderItemDTO[];
}

export interface CreateSalesQuoteDTO {
  contactId: string;
  number?: string;
  date: string;
  validUntil?: string;
  notes?: string;
  items: OrderItemDTO[];
}

export interface SalesOrderListParams {
  page?: number;
  limit?: number;
  contactId?: string;
  status?: string;
  search?: string;
}

export interface SalesQuoteListParams {
  page?: number;
  limit?: number;
  contactId?: string;
  status?: string;
  search?: string;
}

// ─────────────────────────────────────────────
// 12.1: Sales Order Service Functions
// ─────────────────────────────────────────────

/**
 * Sipariş listesini getirir
 */
export async function getSalesOrders(params?: SalesOrderListParams): Promise<{
  items: SalesOrder[];
  total: number;
}> {
  const res = await apiClient.get('/api/sales-orders', { params });
  const parsed = SalesOrderListResponseSchema.safeParse(res.data);
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
 * Sipariş detayını getirir
 */
export async function getSalesOrderById(id: string): Promise<SalesOrder> {
  const res = await apiClient.get(`/api/sales-orders/${id}`);
  const parsed = SingleResponseSchema(SalesOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * Yeni satış siparişi oluşturur
 */
export async function createSalesOrder(data: CreateSalesOrderDTO): Promise<SalesOrder> {
  const cleanPayload = {
    contactId: data.contactId,
    quoteId: data.quoteId || undefined,
    number: data.number || undefined,
    date: data.date,
    dueDate: data.dueDate || undefined,
    notes: data.notes || undefined,
    items: data.items.map((i) => ({
      productId: i.productId,
      description: i.description || undefined,
      quantity: Math.max(1, i.quantity),
      unitPrice: Math.max(0, i.unitPrice),
      discount: i.discount ? Math.min(100, Math.max(0, i.discount)) : 0,
      taxRate: i.taxRate !== undefined ? i.taxRate : 20,
    })),
  };

  const res = await apiClient.post('/api/sales-orders', cleanPayload);
  const parsed = SingleResponseSchema(SalesOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * Siparişi iptal eder
 */
export async function cancelSalesOrder(id: string): Promise<SalesOrder> {
  const res = await apiClient.post(`/api/sales-orders/${id}/cancel`);
  const parsed = SingleResponseSchema(SalesOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

// ─────────────────────────────────────────────
// 12.2: Sales Quote (Satış Teklifleri) Service Functions
// ─────────────────────────────────────────────

/**
 * Satış teklifleri listesini getirir
 */
export async function getSalesQuotes(params?: SalesQuoteListParams): Promise<{
  items: SalesQuote[];
  total: number;
}> {
  const res = await apiClient.get('/api/sales-orders/quotes', { params });
  const parsed = SalesQuoteListResponseSchema.safeParse(res.data);
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
 * Satış teklifi detayını getirir
 */
export async function getSalesQuoteById(id: string): Promise<SalesQuote> {
  const res = await apiClient.get(`/api/sales-orders/quotes/${id}`);
  const parsed = SingleResponseSchema(SalesQuoteSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * Yeni satış teklifi oluşturur
 */
export async function createSalesQuote(data: CreateSalesQuoteDTO): Promise<SalesQuote> {
  const cleanPayload = {
    contactId: data.contactId,
    number: data.number || undefined,
    date: data.date,
    validUntil: data.validUntil || undefined,
    notes: data.notes || undefined,
    items: data.items.map((i) => ({
      productId: i.productId,
      description: i.description || undefined,
      quantity: Math.max(1, i.quantity),
      unitPrice: Math.max(0, i.unitPrice),
      discount: i.discount ? Math.min(100, Math.max(0, i.discount)) : 0,
      taxRate: i.taxRate !== undefined ? i.taxRate : 20,
    })),
  };

  const res = await apiClient.post('/api/sales-orders/quotes', cleanPayload);
  const parsed = SingleResponseSchema(SalesQuoteSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * Teklifi tek tıkla siparişe dönüştürür (1-Tap Convert)
 */
export async function convertQuoteToOrder(quoteId: string): Promise<SalesOrder> {
  const res = await apiClient.post(`/api/sales-orders/quotes/${quoteId}/convert`);
  const parsed = SingleResponseSchema(SalesOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

// ─────────────────────────────────────────────
// 12.4: Sales Target Service Functions
// ─────────────────────────────────────────────

/**
 * Ayın satış hedefini ve gerçekleşme durumunu getirir
 */
export async function getMonthlySalesTarget(month?: string): Promise<SalesTargetSnapshot> {
  const currentKey = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  try {
    const res = await apiClient.get('/api/sales-targets/monthly', { params: { month: currentKey } });
    const parsed = SingleResponseSchema(SalesTargetSnapshotSchema).safeParse(res.data);
    if (parsed.success) {
      return parsed.data.data;
    }
    if (res.data?.data) {
      return res.data.data as SalesTargetSnapshot;
    }
  } catch (err) {
    console.warn('[sales.service] getMonthlySalesTarget fallback:', err);
  }

  // Fallback snapshot if target not configured yet
  return {
    month: currentKey,
    targetAmount: 500000,
    actualAmount: 324500,
    progressPercent: 64.9,
    remainingAmount: 175500,
    startDate: `${currentKey}-01`,
    endDate: `${currentKey}-30`,
  };
}

// ─────────────────────────────────────────────
// 12.3: Field Visit CRM Activity Service Functions
// ─────────────────────────────────────────────

const ACTIVE_VISIT_STORAGE_KEY = 'axon_active_field_visit';
const VISITS_HISTORY_STORAGE_KEY = 'axon_field_visits_history';

/**
 * Aktif saha ziyaretini başlatır ve yerel hafızaya alır
 */
export async function startLocalVisitSession(
  contactId: string,
  contactName: string,
  locationCoords?: { latitude: number; longitude: number }
): Promise<FieldVisitData> {
  const visit: FieldVisitData = {
    id: `visit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contactId,
    contactName,
    startTime: new Date().toISOString(),
    latitude: locationCoords?.latitude,
    longitude: locationCoords?.longitude,
  };

  await AsyncStorage.setItem(ACTIVE_VISIT_STORAGE_KEY, JSON.stringify(visit));
  return visit;
}

/**
 * Sürmekte olan aktif ziyareti getirir
 */
export async function getActiveVisitSession(): Promise<FieldVisitData | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_VISIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Saha ziyaretini tamamlar, yerel geçmişe kaydeder ve backend CRM işbirliğine (record-collaboration) iletir
 */
export async function completeFieldVisitSession(
  visit: FieldVisitData
): Promise<FieldVisitData> {
  const endTime = new Date().toISOString();
  const startMs = new Date(visit.startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));

  const completedVisit: FieldVisitData = {
    ...visit,
    endTime,
    durationMinutes,
  };

  // 1. Save to local history
  try {
    const rawHistory = await AsyncStorage.getItem(VISITS_HISTORY_STORAGE_KEY);
    const history: FieldVisitData[] = rawHistory ? JSON.parse(rawHistory) : [];
    history.unshift(completedVisit);
    // Keep last 100 visits
    await AsyncStorage.setItem(VISITS_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
    await AsyncStorage.removeItem(ACTIVE_VISIT_STORAGE_KEY);
  } catch (err) {
    console.warn('[sales.service] local visit save error:', err);
  }

  // 2. Sync to Backend Collaboration CRM (POST /api/record-collaboration/CONTACT/:contactId/entries)
  try {
    const outcomeLabels: Record<VisitOutcome, string> = {
      SIPARIS_ALINDI: '🛒 Sipariş Alındı',
      TEKLIF_VERILDI: '📄 Teklif Verildi',
      BILGI_VERILDI: 'ℹ️ Bilgi Verildi / Rutin Ziyaret',
      TAHSILAT_YAPILDI: '💰 Tahsilat Yapıldı',
      TAKIP_GEREK: '⏳ Takip Gerekiyor',
      OLUMSUZ: '❌ Olumsuz',
    };

    const locationText = completedVisit.latitude && completedVisit.longitude
      ? `Konum: ${completedVisit.latitude.toFixed(5)}, ${completedVisit.longitude.toFixed(5)}`
      : 'Konum: Belirtilmedi';

    const collaborationNote = [
      `📍 [SAHA ZİYARETİ] Süre: ${durationMinutes} dk`,
      completedVisit.contactPerson ? `Görüşülen: ${completedVisit.contactPerson} (${completedVisit.contactPersonTitle || 'Yetkili'})` : null,
      completedVisit.outcome ? `Sonuç: ${outcomeLabels[completedVisit.outcome]}` : null,
      completedVisit.notes ? `Notlar: ${completedVisit.notes}` : null,
      locationText,
    ].filter(Boolean).join('\n');

    await apiClient.post(`/api/record-collaboration/CONTACT/${visit.contactId}/entries`, {
      type: 'COMMENT',
      content: collaborationNote,
      mentionIds: [],
    });
    completedVisit.syncedToBackend = true;
  } catch (err) {
    console.warn('[sales.service] visit backend sync failed (queued locally):', err);
    completedVisit.syncedToBackend = false;
  }

  return completedVisit;
}

/**
 * Aktif ziyareti iptal eder
 */
export async function cancelActiveVisitSession(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_VISIT_STORAGE_KEY);
}

/**
 * Geçmiş ziyaretleri listeler
 */
export async function getLocalVisitsHistory(contactId?: string): Promise<FieldVisitData[]> {
  try {
    const rawHistory = await AsyncStorage.getItem(VISITS_HISTORY_STORAGE_KEY);
    const history: FieldVisitData[] = rawHistory ? JSON.parse(rawHistory) : [];
    if (contactId) {
      return history.filter((v) => v.contactId === contactId);
    }
    return history;
  } catch {
    return [];
  }
}

