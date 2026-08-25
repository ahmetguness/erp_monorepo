import { openai } from '../../lib/openai';
import { ChatDataService } from '../chat-data.service';
import { ChatContextService, type ChatPageContext, type LoadedChatEntityContext } from '../chat-context.service';
import { logger } from '../../lib/logger';
import { AI_MODELS, AI_PROMPT_VERSIONS, type AiTokenUsage } from '../ai-governance.service';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';
import { getMonthStart, getToday, parseDate } from './date-utils.js';

// ─────────────────────────────────────────────

const purchaseRequestPreviewSessions = new Set<string>();

type PlanTier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

interface ToolDef {
  tool: ChatCompletionTool;
  minPlan: PlanTier;
  /** RBAC modül adı (küçük harf, requirePermission ile aynı). null = herkes erişebilir */
  module: string | null;
  requiredAction?: string;
}

interface PurchaseRequestAdjustment {
  productCode: string;
  quantity: number;
}

/** Kullanıcının sahip olduğu izinler */
export interface UserPermissions {
  isOwner: boolean;
  modules: Array<{ module: string; action: string }>;
}

const PLAN_ORDER: Record<PlanTier, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };

function hasPlanAccess(userPlan: PlanTier, requiredPlan: PlanTier): boolean {
  return PLAN_ORDER[userPlan] >= PLAN_ORDER[requiredPlan];
}

/**
 * Tenant modules (BÜYÜK HARF AppModule) → tool module (küçük harf MODULE_KEY) mapping.
 * Tenant.modules = ['ACCOUNTING', 'CRM', 'SALES', ...]
 * Tool.module = 'accounting', 'contacts', 'invoicing', ...
 */
const TENANT_MODULE_TO_TOOL_MODULE: Record<string, string> = {
  ACCOUNTING: 'accounting',
  INVENTORY: 'inventory',
  CRM: 'contacts',
  SALES: 'invoicing',
  PURCHASING: 'purchasing',
  WAREHOUSE: 'warehouse',
  PRODUCTION: 'production',
  SERVICE: 'service',
  HR: 'hr',
  PAYROLL: 'payroll',
  MARKETPLACE: 'marketplace',
  REPORTING: 'reporting',
};

/** Tenant'ın aktif modüllerini tool module adlarına çevir */
function tenantModulesToToolModules(tenantModules: string[]): string[] {
  return tenantModules.map((m) => TENANT_MODULE_TO_TOOL_MODULE[m.toUpperCase()] ?? m.toLowerCase());
}

/** Plan + Rol + Modül bazlı erişilebilir tool'ları döndür */
export function getAccessibleTools(plan: string, permissions: UserPermissions, tenantModules: string[]): ChatCompletionTool[] {
  const tier = (PLAN_ORDER[plan as PlanTier] !== undefined ? plan : 'STARTER') as PlanTier;
  const activeToolModules = tenantModulesToToolModules(tenantModules);

  return ALL_TOOLS.filter((t) => {
    // 1. Plan kontrolü
    if (!hasPlanAccess(tier, t.minPlan)) return false;

    // 2. Modül kontrolü — tool'un modülü tenant'ın aktif modüllerinde mi
    if (t.module && activeToolModules.length > 0) {
      if (!activeToolModules.includes(t.module)) return false;
    }

    // 3. Rol kontrolü — owner her şeye erişir, değilse gerekli aksiyon izni gerekli
    if (t.module && !permissions.isOwner) {
      const requiredAction = t.requiredAction ?? 'READ';
      const hasRead = permissions.modules.some(
        (p) => p.module === t.module && p.action === requiredAction,
      );
      if (!hasRead) return false;
    }

    return true;
  }).map((t) => t.tool);
}

/** Tool çağrısı yetkisi kontrol et (defense in depth) */
export function canCallTool(toolName: string, plan: string, permissions: UserPermissions, tenantModules: string[]): boolean {
  const tier = (PLAN_ORDER[plan as PlanTier] !== undefined ? plan : 'STARTER') as PlanTier;
  const def = ALL_TOOLS.find((t) => t.tool.type === 'function' && t.tool.function.name === toolName);
  if (!def) return false;

  if (!hasPlanAccess(tier, def.minPlan)) return false;

  const activeToolModules = tenantModulesToToolModules(tenantModules);
  if (def.module && activeToolModules.length > 0) {
    if (!activeToolModules.includes(def.module)) return false;
  }

  if (def.module && !permissions.isOwner) {
    const requiredAction = def.requiredAction ?? 'READ';
    const hasRead = permissions.modules.some(
      (p) => p.module === def.module && p.action === requiredAction,
    );
    if (!hasRead) return false;
  }

  return true;
}

const ALL_TOOLS: ToolDef[] = [
  // ── STARTER ────────────────────────────────
  {
    minPlan: 'STARTER',
    module: null,
    tool: {
      type: 'function',
      function: {
        name: 'get_invoices',
        description: 'Son faturaları getirir (satış ve alış). Fatura listesi, fatura durumu sorguları için kullan.',
        parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Kaç fatura getirileceği (max 50)', default: 20 } } },
      },
    },
  },
  {
    minPlan: 'STARTER', module: null,
    tool: { type: 'function', function: { name: 'get_overdue_invoices', description: 'Vadesi geçmiş (gecikmiş) faturaları getirir. Kaç gün geciktiği bilgisini de içerir.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'STARTER', module: null,
    tool: { type: 'function', function: { name: 'get_revenue', description: 'Belirli dönem için gelir/ciro raporunu getirir.', parameters: { type: 'object', properties: { dateFrom: { type: 'string', description: 'Başlangıç tarihi (YYYY-MM-DD)' }, dateTo: { type: 'string', description: 'Bitiş tarihi (YYYY-MM-DD)' } }, required: ['dateFrom', 'dateTo'] } } },
  },
  {
    minPlan: 'STARTER', module: null,
    tool: { type: 'function', function: { name: 'get_expenses', description: 'Belirli dönem için gider raporunu getirir.', parameters: { type: 'object', properties: { dateFrom: { type: 'string', description: 'Başlangıç tarihi (YYYY-MM-DD)' }, dateTo: { type: 'string', description: 'Bitiş tarihi (YYYY-MM-DD)' } }, required: ['dateFrom', 'dateTo'] } } },
  },
  {
    minPlan: 'STARTER', module: null,
    tool: { type: 'function', function: { name: 'get_balances', description: 'Cari hesap bakiyelerini getirir. Cari bakiye, alacak, borç, kredi limiti aşımı ve riskli cari sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'STARTER', module: 'inventory',
    tool: { type: 'function', function: { name: 'get_stock', description: 'Stok durumunu getirir. Stok seviyesi, minimum stok altı ürünler, stok uyarıları ve toplam stok değeri sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'STARTER', module: null,
    tool: { type: 'function', function: { name: 'get_daily_summary', description: 'Günlük özet raporu getirir. Bugünkü satış/alış tutarları, gecikmiş fatura tutarı, bekleyen ödeme tutarı, açık sipariş sayısı ve stok uyarıları dahil.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'STARTER', module: 'inventory',
    tool: { type: 'function', function: { name: 'get_products', description: 'Ürün listesini getirir. Ürün arama, fiyat, kategori sorguları için kullan.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Ürün adı veya kodu ile arama' } } } } },
  },
  {
    minPlan: 'STARTER', module: null,
    tool: { type: 'function', function: { name: 'get_contact_detail', description: 'Belirli bir cari hesabın detayını getirir. Müşteri/tedarikçi bilgisi, bakiye sorguları için kullan.', parameters: { type: 'object', properties: { contactName: { type: 'string', description: 'Cari hesap adı (kısmi eşleşme)' } }, required: ['contactName'] } } },
  },
  {
    minPlan: 'STARTER',
    module: 'invoicing',
    tool: {
      type: 'function',
      function: {
        name: 'summarize_contact_recent_invoices',
        description: 'Belirli bir cari icin son faturalari ozetler. "Bu cari icin son 3 faturayi ozetle" gibi sorularda kullan.',
        parameters: {
          type: 'object',
          properties: {
            contactName: { type: 'string', description: 'Cari adi veya kodu' },
            limit: { type: 'number', description: 'Kac fatura ozetlenecek. Varsayilan 3, maksimum 10.' },
          },
          required: ['contactName'],
        },
      },
    },
  },
  {
    minPlan: 'STARTER',
    module: 'invoicing',
    tool: {
      type: 'function',
      function: {
        name: 'draft_overdue_invoice_reminders',
        description: 'Vadesi gecmis satis faturalarini listeler ve musterilere gonderilecek hatirlatma maili taslaklari hazirlar. Mail gondermez.',
        parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Maksimum taslak sayisi. Varsayilan 10, maksimum 25.' } } },
      },
    },
  },
  {
    minPlan: 'STARTER',
    module: 'accounting',
    tool: {
      type: 'function',
      function: {
        name: 'forecast_cash_flow_risk',
        description: 'Gelir, gider, geciken tahsilat, bekleyen odeme ve yaklasan cek/senetlere gore nakit akisi riskini tahmin eder.',
        parameters: {
          type: 'object',
          properties: {
            dateFrom: { type: 'string', description: 'Baslangic tarihi (YYYY-MM-DD). Bos ise ay basi.' },
            dateTo: { type: 'string', description: 'Bitis tarihi (YYYY-MM-DD). Bos ise bugun.' },
          },
        },
      },
    },
  },
  {
    minPlan: 'STARTER', module: 'inventory',
    tool: { type: 'function', function: { name: 'get_stock_movements', description: 'Stok hareketlerini getirir. Giriş, çıkış, transfer hareketleri sorguları için kullan.', parameters: { type: 'object', properties: { productName: { type: 'string', description: 'Ürün adı ile filtreleme (opsiyonel)' } } } } },
  },
  // ── PROFESSIONAL ───────────────────────────
  {
    minPlan: 'PROFESSIONAL', module: 'invoicing',
    tool: { type: 'function', function: { name: 'get_sales_orders', description: 'Satış siparişlerini getirir. Sipariş durumu, açık siparişler sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'accounting',
    tool: { type: 'function', function: { name: 'get_pending_payments', description: 'Bekleyen ödemeleri getirir. Ödeme durumu, bekleyen tahsilat/tediye sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'purchasing',
    tool: { type: 'function', function: { name: 'get_purchase_orders', description: 'Satın alma siparişlerini getirir. Tedarik, satın alma durumu sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'accounting',
    tool: { type: 'function', function: { name: 'get_due_checks', description: 'Vadesi yaklaşan veya geçmiş çek/senetleri getirir. Çek, senet, vade sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'invoicing',
    tool: { type: 'function', function: { name: 'get_sales_quotes', description: 'Satış tekliflerini getirir. Teklif durumu, açık teklifler sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'purchasing',
    tool: { type: 'function', function: { name: 'get_purchase_requests', description: 'Satın alma taleplerini getirir. Talep durumu, onay bekleyen talepler sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL',
    module: 'purchasing',
    requiredAction: 'CREATE',
    tool: {
      type: 'function',
      function: {
        name: 'create_purchase_request_from_low_stock',
        description: 'Minimum stok seviyesinin altindaki urunler icin taslak satin alma talebi hazirlar veya onaydan sonra olusturur. Ilk cagrida confirmed=false kullan ve sadece onizleme/onay iste. Kullanici acikca onay verirse confirmed=true ile cagir. Olusan talep DRAFT durumundadir.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Talebe eklenecek maksimum ürün sayısı. Varsayılan 10, maksimum 25.' },
            note: { type: 'string', description: 'Talep notuna eklenecek kisa aciklama.' },
            confirmed: { type: 'boolean', description: 'Kullanici onizlenen toplami ve kalemleri acikca onayladiysa true. Ilk taslak talebinde false birak.' },
            adjustments: {
              type: 'array',
              description: 'Kullanicinin degistirdigi urun adetleri. Urun kodu ve yeni adet gonderilir.',
              items: {
                type: 'object',
                properties: {
                  productCode: { type: 'string', description: 'Urun kodu, orn. P004.' },
                  quantity: { type: 'number', description: 'Satin alma talebine yazilacak yeni adet.' },
                },
                required: ['productCode', 'quantity'],
              },
            },
          },
        },
      },
    },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'warehouse',
    tool: { type: 'function', function: { name: 'get_delivery_notes', description: 'İrsaliyeleri getirir. Sevkiyat, teslimat, irsaliye durumu sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'accounting',
    tool: { type: 'function', function: { name: 'get_bank_transactions', description: 'Banka hareketlerini getirir. Banka hesap hareketleri, yatırma, çekme sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'accounting',
    tool: { type: 'function', function: { name: 'get_e_documents', description: 'E-Belgeleri getirir. E-fatura, e-irsaliye durumu sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'accounting',
    tool: { type: 'function', function: { name: 'get_ledger_accounts', description: 'Hesap planını getirir. Muhasebe hesapları, hesap kodu sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'PROFESSIONAL', module: 'accounting',
    tool: { type: 'function', function: { name: 'get_journal_entries', description: 'Yevmiye fişlerini getirir. Muhasebe kayıtları, borç/alacak sorguları için kullan.', parameters: { type: 'object', properties: { dateFrom: { type: 'string', description: 'Başlangıç tarihi (YYYY-MM-DD)' }, dateTo: { type: 'string', description: 'Bitiş tarihi (YYYY-MM-DD)' } } } } },
  },
  // ── ENTERPRISE ─────────────────────────────
  {
    minPlan: 'ENTERPRISE', module: 'hr',
    tool: { type: 'function', function: { name: 'get_employees', description: 'Personel listesini getirir. Çalışan, personel, kadro sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'hr',
    tool: { type: 'function', function: { name: 'get_employee_summary', description: 'Personel özetini getirir. Toplam çalışan sayısı, departman dağılımı sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'hr',
    tool: { type: 'function', function: { name: 'get_employee_payroll', description: 'Belirli bir personelin bordro geçmişini getirir. Personel adı veya soyadı ile arama yapar.', parameters: { type: 'object', properties: { employeeName: { type: 'string', description: 'Personelin adı veya soyadı' } }, required: ['employeeName'] } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'payroll',
    tool: { type: 'function', function: { name: 'get_payroll_summary', description: 'Bordro özetini getirir. Genel toplam sorularında period="all" gönder.', parameters: { type: 'object', properties: { period: { type: 'string', description: 'Bordro dönemi. YYYY-MM veya "all". Belirtilmezse bu ay.' } } } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'hr',
    tool: { type: 'function', function: { name: 'get_attendance_summary', description: 'Puantaj özetini getirir. Giriş/çıkış, mesai sorguları için kullan.', parameters: { type: 'object', properties: { dateFrom: { type: 'string', description: 'Başlangıç tarihi (YYYY-MM-DD)' }, dateTo: { type: 'string', description: 'Bitiş tarihi (YYYY-MM-DD)' } } } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'hr',
    tool: { type: 'function', function: { name: 'get_pending_leaves', description: 'Bekleyen izin taleplerini getirir. İzin, tatil sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'service',
    tool: { type: 'function', function: { name: 'get_service_requests', description: 'Açık servis taleplerini getirir. Servis, teknik destek sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'production',
    tool: { type: 'function', function: { name: 'get_work_orders', description: 'Açık iş emirlerini getirir. Üretim, iş emri sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'marketplace',
    tool: { type: 'function', function: { name: 'get_marketplace_orders', description: 'Pazaryeri siparişlerini getirir. Trendyol, Hepsiburada, N11 sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'production',
    tool: { type: 'function', function: { name: 'get_boms', description: 'Ürün ağaçlarını (BOM) getirir. Reçete, malzeme listesi sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'service',
    tool: { type: 'function', function: { name: 'get_customer_assets', description: 'Müşteri varlıklarını getirir. Servis altındaki cihazlar, garanti sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
  {
    minPlan: 'ENTERPRISE', module: 'marketplace',
    tool: { type: 'function', function: { name: 'get_marketplace_integrations', description: 'Pazaryeri entegrasyonlarını getirir. Bağlı pazaryerleri sorguları için kullan.', parameters: { type: 'object', properties: {} } } },
  },
];

// ─────────────────────────────────────────────
// Function call executor
// ─────────────────────────────────────────────

export async function executeFunctionCall(
  name: string,
  args: Record<string, unknown>,
  tenantId: string,
  sessionId: string,
  plan: string,
  permissions: UserPermissions,
  tenantModules: string[],
): Promise<string> {
  // Üç katmanlı yetki kontrolü
  if (!canCallTool(name, plan, permissions, tenantModules)) {
    return JSON.stringify({ error: `Bu veriye erişim yetkiniz bulunmuyor.` });
  }

  try {
    let result: unknown;

    switch (name) {
      case 'get_invoices':
        result = await ChatDataService.getInvoices(tenantId, Math.max(1, Math.min(Number(args.limit) || 20, 50)));
        break;
      case 'get_overdue_invoices':
        result = await ChatDataService.getOverdueInvoices(tenantId);
        break;
      case 'get_revenue': {
        const from = parseDate(args.dateFrom as string) ?? getMonthStart();
        const to = parseDate(args.dateTo as string) ?? getToday();
        result = await ChatDataService.getRevenue(tenantId, from, to);
        break;
      }
      case 'get_expenses': {
        const from = parseDate(args.dateFrom as string) ?? getMonthStart();
        const to = parseDate(args.dateTo as string) ?? getToday();
        result = await ChatDataService.getExpenses(tenantId, from, to);
        break;
      }
      case 'get_balances':
        result = await ChatDataService.getBalances(tenantId);
        break;
      case 'get_stock':
        result = await ChatDataService.getStock(tenantId);
        break;
      case 'get_sales_orders':
        result = await ChatDataService.getSalesOrders(tenantId);
        break;
      case 'get_pending_payments':
        result = await ChatDataService.getPendingPayments(tenantId);
        break;
      case 'get_purchase_orders':
        result = await ChatDataService.getPurchaseOrders(tenantId);
        break;
      case 'get_service_requests':
        result = await ChatDataService.getOpenServiceRequests(tenantId);
        break;
      case 'get_due_checks':
        result = await ChatDataService.getDueChecks(tenantId);
        break;
      case 'get_sales_quotes':
        result = await ChatDataService.getSalesQuotes(tenantId);
        break;
      case 'get_purchase_requests':
        result = await ChatDataService.getPurchaseRequests(tenantId);
        break;
      case 'create_purchase_request_from_low_stock':
        result = await ChatDataService.createPurchaseRequestFromLowStock(
          tenantId,
          {
            limit: Math.max(1, Math.min(Number(args.limit) || 10, 25)),
            note: typeof args.note === 'string' ? args.note : undefined,
            confirmed: args.confirmed === true && purchaseRequestPreviewSessions.has(sessionId),
            adjustments: parsePurchaseRequestAdjustments(args.adjustments),
          },
        );
        if (isPurchaseRequestPreviewResult(result)) {
          purchaseRequestPreviewSessions.add(sessionId);
        } else if (isPurchaseRequestCreatedResult(result)) {
          purchaseRequestPreviewSessions.delete(sessionId);
        }
        break;
      case 'get_delivery_notes':
        result = await ChatDataService.getDeliveryNotes(tenantId);
        break;
      case 'get_bank_transactions':
        result = await ChatDataService.getBankTransactions(tenantId);
        break;
      case 'get_e_documents':
        result = await ChatDataService.getEDocuments(tenantId);
        break;
      case 'get_ledger_accounts':
        result = await ChatDataService.getLedgerAccounts(tenantId);
        break;
      case 'get_journal_entries':
        result = await ChatDataService.getJournalEntries(tenantId, args.dateFrom as string | undefined, args.dateTo as string | undefined);
        break;
      case 'get_pending_leaves':
        result = await ChatDataService.getPendingLeaves(tenantId);
        break;
      case 'get_work_orders':
        result = await ChatDataService.getOpenWorkOrders(tenantId);
        break;
      case 'get_marketplace_orders':
        result = await ChatDataService.getMarketplaceOrders(tenantId);
        break;
      case 'get_boms':
        result = await ChatDataService.getBOMs(tenantId);
        break;
      case 'get_customer_assets':
        result = await ChatDataService.getCustomerAssets(tenantId);
        break;
      case 'get_marketplace_integrations':
        result = await ChatDataService.getMarketplaceIntegrations(tenantId);
        break;
      case 'get_daily_summary':
        result = await ChatDataService.getDailySummary(tenantId);
        break;
      case 'get_products':
        result = await ChatDataService.getProducts(tenantId, args.search as string | undefined);
        break;
      case 'get_contact_detail':
        result = await ChatDataService.getContactDetail(tenantId, String(args.contactName ?? ''));
        break;
      case 'summarize_contact_recent_invoices':
        result = await ChatDataService.summarizeContactRecentInvoices(
          tenantId,
          String(args.contactName ?? ''),
          Math.max(1, Math.min(Number(args.limit) || 3, 10)),
        );
        break;
      case 'draft_overdue_invoice_reminders':
        result = await ChatDataService.draftOverdueInvoiceReminders(
          tenantId,
          Math.max(1, Math.min(Number(args.limit) || 10, 25)),
        );
        break;
      case 'forecast_cash_flow_risk': {
        const from = typeof args.dateFrom === 'string' ? parseDate(args.dateFrom) ?? getMonthStart() : getMonthStart();
        const to = typeof args.dateTo === 'string' ? parseDate(args.dateTo) ?? getToday() : getToday();
        result = await ChatDataService.forecastCashFlowRisk(tenantId, from, to);
        break;
      }
      case 'get_stock_movements':
        result = await ChatDataService.getStockMovements(tenantId, args.productName as string | undefined);
        break;
      case 'get_employees':
        result = await ChatDataService.getEmployees(tenantId);
        break;
      case 'get_employee_summary':
        result = await ChatDataService.getEmployeeSummary(tenantId);
        break;
      case 'get_employee_payroll':
        result = await ChatDataService.getEmployeePayroll(tenantId, String(args.employeeName ?? ''));
        break;
      case 'get_payroll_summary':
        result = await ChatDataService.getPayrollSummary(tenantId, args.period as string | undefined);
        break;
      case 'get_attendance_summary':
        result = await ChatDataService.getAttendanceSummary(tenantId, args.dateFrom as string | undefined, args.dateTo as string | undefined);
        break;
      default:
        result = { error: `Bilinmeyen fonksiyon: ${name}` };
    }

    return JSON.stringify(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Chat function call error [${name}]: ${errMsg}`);
    return JSON.stringify({ error: `Veri alınamadı: ${name}` });
  }
}

export function parsePurchaseRequestAdjustments(value: unknown): PurchaseRequestAdjustment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];

    const productCodeValue = Reflect.get(item, 'productCode');
    const quantityValue = Reflect.get(item, 'quantity');
    const quantity = Number(quantityValue);

    if (typeof productCodeValue !== 'string' || !productCodeValue.trim() || !Number.isFinite(quantity)) {
      return [];
    }

    return [{ productCode: productCodeValue.trim(), quantity }];
  });
}

export function isPurchaseRequestPreviewResult(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'created') === false &&
    Reflect.get(value, 'confirmationRequired') === true
  );
}

export function isPurchaseRequestCreatedResult(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'created') === true
  );
}

// ─────────────────────────────────────────────
// System prompts
// ─────────────────────────────────────────────
