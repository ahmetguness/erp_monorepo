import { apiClient } from '../lib/api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ChatEntityType =
  | 'contact'
  | 'invoice'
  | 'sales_quote'
  | 'sales_order'
  | 'employee'
  | 'product';

export interface ChatRecentRecord {
  entityType: ChatEntityType;
  entityId: string;
  label: string;
  path: string;
  viewedAt: string;
}

export interface ChatPageContext {
  path: string;
  title?: string;
  entityType?: ChatEntityType;
  entityId?: string;
  entityLabel?: string;
  recentRecords?: ChatRecentRecord[];
}

export interface ChatResponse {
  output: string;
  usedTools: boolean;
}

export type ActionableEntityType =
  | 'finance'
  | 'sales'
  | 'inventory'
  | 'field_service'
  | 'production'
  | 'hr';

export interface ActionableEntity {
  id: string;
  type: ActionableEntityType;
  label: string;
  icon: string;
  targetScreen: 'Finance' | 'SalesTab' | 'InventoryTab' | 'FieldService' | 'ProductionShopFloor' | 'EmployeePortal';
  params?: Record<string, unknown>;
  badge?: string;
}

export interface ParsedChatOutput {
  cleanText: string;
  suggestions: string[];
  actionEntities: ActionableEntity[];
}

export interface PromptCategory {
  id: string;
  label: string;
  icon: string;
  prompts: string[];
}

// ─────────────────────────────────────────────
// Predefined Prompt Categories
// ─────────────────────────────────────────────

export const PROMPT_CATEGORIES: readonly PromptCategory[] = [
  {
    id: 'finance',
    label: 'Finans & Nakit',
    icon: 'cash-outline',
    prompts: [
      'Bugün vadesi gelen ödemeler?',
      'Vadesi geçmiş faturaları listele',
      'Bu ay gelir ve gider dengesi nasıl?',
      'Nakit akışı riskini özetle',
    ],
  },
  {
    id: 'inventory',
    label: 'Stok & Depo',
    icon: 'cube-outline',
    prompts: [
      'Kritik seviyedeki ürünleri listele',
      'Hangi depoda stok eksiği var?',
      'Son 7 günün stok hareketleri',
      'En çok stok tutan 5 ürün hangisi?',
    ],
  },
  {
    id: 'sales',
    label: 'Satış & Cari',
    icon: 'cart-outline',
    prompts: [
      'Bu ay en çok satan 3 müşteri?',
      'Açık ve bekleyen siparişleri listele',
      'Onay bekleyen satış teklifleri',
      'En riskli cari hesaplar hangileri?',
    ],
  },
  {
    id: 'operations',
    label: 'İK & Operasyon',
    icon: 'briefcase-outline',
    prompts: [
      'Bugün izinli olan personeller kimler?',
      'Açık saha servis talepleri',
      'Üretimdeki açık iş emirleri',
      'Onay bekleyen izin talepleri',
    ],
  },
] as const;

// ─────────────────────────────────────────────
// Response Parser & Action Matcher
// ─────────────────────────────────────────────

export function parseAssistantResponse(rawOutput: string): ParsedChatOutput {
  if (!rawOutput) {
    return { cleanText: '', suggestions: [], actionEntities: [] };
  }

  let cleanText = rawOutput;
  let suggestions: string[] = [];

  // 1. Suggestions Parsing (e.g. \n---\n{"suggestions":["..."]})
  const separator = cleanText.lastIndexOf('\n---\n');
  if (separator !== -1) {
    const candidateJson = cleanText.slice(separator + 5).trim();
    try {
      const parsed = JSON.parse(candidateJson);
      if (parsed && Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions
          .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
          .slice(0, 4);
        cleanText = cleanText.slice(0, separator).trim();
      }
    } catch {
      // JSON parse fallback: keep text as is
    }
  }

  // 2. Actionable Entity Detection
  const actionEntities: ActionableEntity[] = [];
  const lowerText = cleanText.toLowerCase();

  // Invoice / Finance Actions
  const hasInvoicePattern = /\b(FAT|INV)-\d+/i.test(cleanText);
  const mentionsOverdue = lowerText.includes('gecikmiş') || lowerText.includes('vadesi geçmiş') || lowerText.includes('geciken fatura');
  const mentionsEdocument = lowerText.includes('e-belge') || lowerText.includes('e-fatura') || lowerText.includes('e-irsaliye') || lowerText.includes('e-arşiv');
  const mentionsPayment = lowerText.includes('ödeme') || lowerText.includes('tahsilat') || lowerText.includes('bakiye') || lowerText.includes('alacak');

  if (hasInvoicePattern || mentionsOverdue) {
    actionEntities.push({
      id: 'act-finance-overdue',
      type: 'finance',
      label: 'Vadesi Geçmiş Faturalar',
      icon: 'alert-circle-outline',
      targetScreen: 'Finance',
      params: { initialTab: 'overdue' },
      badge: 'Finans',
    });
  } else if (mentionsEdocument) {
    actionEntities.push({
      id: 'act-finance-edoc',
      type: 'finance',
      label: 'E-Belgeler',
      icon: 'document-text-outline',
      targetScreen: 'Finance',
      params: { initialTab: 'edocuments' },
      badge: 'E-Dönüşüm',
    });
  } else if (mentionsPayment) {
    actionEntities.push({
      id: 'act-finance-pay',
      type: 'finance',
      label: 'Finans & Tahsilat',
      icon: 'card-outline',
      targetScreen: 'Finance',
      params: { initialTab: 'payments' },
      badge: 'Finans',
    });
  }

  // Sales Orders / Quotes Actions
  const hasOrderPattern = /\b(SIP|ORD|TEK|QUO)-\d+/i.test(cleanText);
  const mentionsOrders = lowerText.includes('sipariş') || lowerText.includes('satış') || lowerText.includes('teklif') || lowerText.includes('en çok satan müşteri');

  if (hasOrderPattern || mentionsOrders) {
    actionEntities.push({
      id: 'act-sales-orders',
      type: 'sales',
      label: 'Satış & Siparişler',
      icon: 'cart-outline',
      targetScreen: 'SalesTab',
      badge: 'Satış',
    });
  }

  // Inventory / Stock Actions
  const hasProductPattern = /\bPRD-\d+/i.test(cleanText);
  const mentionsStock = lowerText.includes('stok') || lowerText.includes('ürün') || lowerText.includes('depo') || lowerText.includes('kritik seviye') || lowerText.includes('envanter');

  if (hasProductPattern || mentionsStock) {
    actionEntities.push({
      id: 'act-inventory-stock',
      type: 'inventory',
      label: 'Stok & Envanter',
      icon: 'cube-outline',
      targetScreen: 'InventoryTab',
      badge: 'Depo',
    });
  }

  // Field Service Actions
  const hasServicePattern = /\b(SRV|SERV)-\d+/i.test(cleanText);
  const mentionsService = lowerText.includes('teknik servis') || lowerText.includes('servis talebi') || lowerText.includes('arıza') || lowerText.includes('bakım randevusu');

  if (hasServicePattern || mentionsService) {
    actionEntities.push({
      id: 'act-field-service',
      type: 'field_service',
      label: 'Saha Teknik Servis',
      icon: 'construct-outline',
      targetScreen: 'FieldService',
      badge: 'Servis',
    });
  }

  // Production / Shop Floor Actions
  const hasWorkOrderPattern = /\b(WO|ISE)-\d+/i.test(cleanText);
  const mentionsProduction = lowerText.includes('iş emri') || lowerText.includes('üretim') || lowerText.includes('tezgah') || lowerText.includes('reçete') || lowerText.includes('ürün ağacı');

  if (hasWorkOrderPattern || mentionsProduction) {
    actionEntities.push({
      id: 'act-production-shopfloor',
      type: 'production',
      label: 'Üretim Takibi (Shop Floor)',
      icon: 'hardware-chip-outline',
      targetScreen: 'ProductionShopFloor',
      badge: 'Üretim',
    });
  }

  // HR / Employee Portal Actions
  const mentionsLeaves = lowerText.includes('izin') || lowerText.includes('yıllık izin') || lowerText.includes('mazeret');
  const mentionsPayroll = lowerText.includes('bordro') || lowerText.includes('maaş') || lowerText.includes('ücret pusulası');
  const mentionsShifts = lowerText.includes('vardiya') || lowerText.includes('mesai') || lowerText.includes('puantaj');
  const mentionsEmployee = lowerText.includes('personel') || lowerText.includes('çalışan') || lowerText.includes('kadro');

  if (mentionsLeaves) {
    actionEntities.push({
      id: 'act-hr-leaves',
      type: 'hr',
      label: 'İzin Talepleri',
      icon: 'calendar-outline',
      targetScreen: 'EmployeePortal',
      params: { initialTab: 'leaves' },
      badge: 'İK',
    });
  } else if (mentionsPayroll) {
    actionEntities.push({
      id: 'act-hr-payrolls',
      type: 'hr',
      label: 'Maaş Bordrosu',
      icon: 'cash-outline',
      targetScreen: 'EmployeePortal',
      params: { initialTab: 'payrolls' },
      badge: 'İK',
    });
  } else if (mentionsShifts) {
    actionEntities.push({
      id: 'act-hr-shifts',
      type: 'hr',
      label: 'Vardiya Takvimi',
      icon: 'time-outline',
      targetScreen: 'EmployeePortal',
      params: { initialTab: 'shifts' },
      badge: 'İK',
    });
  } else if (mentionsEmployee) {
    actionEntities.push({
      id: 'act-hr-portal',
      type: 'hr',
      label: 'Çalışan Portalı',
      icon: 'people-outline',
      targetScreen: 'EmployeePortal',
      badge: 'İK',
    });
  }

  // Deduplicate by targetScreen and params if any
  const seenKeys = new Set<string>();
  const uniqueEntities = actionEntities.filter((act) => {
    const key = `${act.targetScreen}_${JSON.stringify(act.params ?? {})}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  return {
    cleanText,
    suggestions,
    actionEntities: uniqueEntities.slice(0, 3), // Show top 3 most relevant actions
  };
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * Sends a chat message with optional page context to the AI assistant endpoint.
 */
export async function sendChatMessage(
  message: string,
  context?: ChatPageContext,
): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>('/api/chat', {
    message,
    context,
  });
  return res.data;
}

/**
 * Clears the server-side conversation history.
 */
export async function clearChatHistory(): Promise<void> {
  await apiClient.delete('/api/chat/history');
}
