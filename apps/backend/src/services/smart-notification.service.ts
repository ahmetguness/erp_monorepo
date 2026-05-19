import {
  ApprovalStatus,
  EDocumentStatus,
  InvoiceStatus,
  LeaveStatus,
  MailDeliveryStatus,
  PermissionAction,
  Prisma,
  ServiceStatus,
  type PrismaClient,
} from '@prisma/client';
import { getTenantPermissionContext } from '../lib/tenant-permissions.js';

export type SmartNotificationSeverity = 'critical' | 'high' | 'medium' | 'low';
export type SmartNotificationCategory =
  | 'collection_due'
  | 'low_stock'
  | 'pending_approval'
  | 'pending_leave'
  | 'service_sla'
  | 'edocument_error'
  | 'mail_failed';
export type SmartNotificationLifecycleStatus = 'new' | 'acknowledged' | 'completed' | 'snoozed' | 'hidden';
export type SmartNotificationAction = 'acknowledge' | 'complete' | 'snooze' | 'hide' | 'reopen';

export interface SmartNotificationSuggestedAction {
  type: 'open' | 'review' | 'create_task' | 'send_mail';
  label: string;
  href: string;
}

export interface SmartNotificationItem {
  id: string;
  category: SmartNotificationCategory;
  severity: SmartNotificationSeverity;
  title: string;
  message: string;
  count: number;
  href: string;
  module: string;
  sourceType: string;
  sourceId: string | null;
  actionHref: string;
  suggestedAction: SmartNotificationSuggestedAction;
  lifecycleStatus: SmartNotificationLifecycleStatus;
  snoozedUntil: string | null;
  createdAt: string;
}

export interface SmartNotificationSummary {
  items: SmartNotificationItem[];
  totalCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
}

interface SmartNotificationState {
  status: SmartNotificationLifecycleStatus;
  snoozedUntil?: string | null;
  updatedAt: string;
}

type SmartNotificationStateMap = Record<string, SmartNotificationState>;

const UPCOMING_DAYS = 7;
const SERVICE_SLA_HOURS = 48;
const PREF_KEY = 'smartNotifications';

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function hoursAgo(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
}

function formatTRY(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function smartItem(input: Omit<SmartNotificationItem, 'createdAt' | 'lifecycleStatus' | 'snoozedUntil'>): SmartNotificationItem {
  return { ...input, lifecycleStatus: 'new', snoozedUntil: null, createdAt: new Date().toISOString() };
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLifecycleStatus(value: unknown): value is SmartNotificationLifecycleStatus {
  return value === 'new' || value === 'acknowledged' || value === 'completed' || value === 'snoozed' || value === 'hidden';
}

function parseStateMap(preferences: Prisma.JsonValue | null): SmartNotificationStateMap {
  if (!isRecord(preferences)) return {};
  const raw = preferences[PREF_KEY];
  if (!isRecord(raw)) return {};

  const entries = Object.entries(raw).flatMap(([id, value]) => {
    if (!isRecord(value) || !isLifecycleStatus(value.status) || typeof value.updatedAt !== 'string') return [];
    const snoozedUntil = typeof value.snoozedUntil === 'string' ? value.snoozedUntil : null;
    return [[id, { status: value.status, snoozedUntil, updatedAt: value.updatedAt } satisfies SmartNotificationState] as const];
  });

  return Object.fromEntries(entries);
}

function shouldHideByState(state: SmartNotificationState | undefined, now: Date): boolean {
  if (!state) return false;
  if (state.status === 'hidden' || state.status === 'completed') return true;
  if (state.status !== 'snoozed' || !state.snoozedUntil) return false;
  return new Date(state.snoozedUntil).getTime() > now.getTime();
}

function applyState(item: SmartNotificationItem, state: SmartNotificationState | undefined): SmartNotificationItem {
  if (!state) return item;
  return {
    ...item,
    lifecycleStatus: state.status,
    snoozedUntil: state.snoozedUntil ?? null,
  };
}

function toInputStateMap(stateMap: SmartNotificationStateMap): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(stateMap).map(([id, state]) => [
      id,
      {
        status: state.status,
        snoozedUntil: state.snoozedUntil ?? null,
        updatedAt: state.updatedAt,
      } satisfies Prisma.InputJsonObject,
    ]),
  );
}

function summaryEmpty(): SmartNotificationSummary {
  return { items: [], totalCount: 0, criticalCount: 0, highCount: 0, mediumCount: 0 };
}

async function getTenantUserEmail(db: PrismaClient, tenantId: string, userId: string): Promise<string | null> {
  const tenantUser = await db.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true, user: { isActive: true } },
    select: { user: { select: { email: true } } },
  });
  return tenantUser?.user.email ?? null;
}

function visibleMailWhere(userId: string, email: string): Prisma.MailMessageWhereInput {
  return {
    OR: [
      { sentById: userId },
      { to: { has: email } },
      { cc: { has: email } },
      { bcc: { has: email } },
    ],
  };
}

export class SmartNotificationService {
  constructor(private readonly db: PrismaClient) {}

  async getSummary(tenantId: string, userId: string): Promise<SmartNotificationSummary> {
    const permissionContext = await getTenantPermissionContext(tenantId, userId);
    if (!permissionContext) return summaryEmpty();

    const canRead = (module: string): boolean => permissionContext.can(PermissionAction.READ, module);
    const now = new Date();
    const soon = daysFromNow(UPCOMING_DAYS);
    const serviceRiskDate = hoursAgo(SERVICE_SLA_HOURS);
    const preferences = await this.db.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { preferences: true },
    });
    const stateMap = parseStateMap(preferences?.preferences ?? null);
    const userEmail = canRead('mail') ? await getTenantUserEmail(this.db, tenantId, userId) : null;

    const [
      collectionDueInvoices,
      lowStocks,
      pendingApprovals,
      pendingLeaves,
      serviceSlaRisks,
      eDocumentErrors,
      mailFailures,
    ] = await this.db.$transaction([
      this.db.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
          dueDate: { gte: now, lte: soon },
        },
        select: { id: true, totalGross: true },
        take: 100,
      }),
      this.db.stockLevel.findMany({
        where: {
          tenantId,
          product: { deletedAt: null, isActive: true },
        },
        select: {
          id: true,
          quantity: true,
          productId: true,
          product: { select: { minStockLevel: true, code: true, name: true } },
        },
      }),
      this.db.approvalRequest.count({
        where: { tenantId, status: ApprovalStatus.PENDING },
      }),
      this.db.leaveRequest.count({
        where: { tenantId, deletedAt: null, status: LeaveStatus.PENDING },
      }),
      this.db.serviceRequest.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [ServiceStatus.OPEN, ServiceStatus.IN_PROGRESS, ServiceStatus.WAITING_PARTS, ServiceStatus.WAITING_CUSTOMER] },
          createdAt: { lte: serviceRiskDate },
        },
      }),
      this.db.eDocument.count({
        where: { tenantId, status: { in: [EDocumentStatus.ERROR, EDocumentStatus.REJECTED] } },
      }),
      this.db.mailMessage.count({
        where: {
          tenantId,
          status: MailDeliveryStatus.FAILED,
          AND: [userEmail ? visibleMailWhere(userId, userEmail) : { id: '__no_visible_mail__' }],
        },
      }),
    ]);

    const collectionDue = collectionDueInvoices.length;
    const collectionAmount = collectionDueInvoices.reduce((total, invoice) => total + Number(invoice.totalGross), 0);
    const lowStockItems = lowStocks.filter((stock) => Number(stock.quantity) <= Number(stock.product.minStockLevel));
    const lowStockCount = lowStockItems.length;

    const items: SmartNotificationItem[] = [
      ...(canRead('invoicing') && collectionDue > 0
        ? [
            smartItem({
              id: 'smart:collection-due',
              category: 'collection_due',
              severity: collectionAmount >= 100_000 ? 'critical' : 'high',
              title: 'Tahsilat vadesi yaklaşıyor',
              message: `${UPCOMING_DAYS} gün içinde vadesi gelecek ${collectionDue} fatura var. Toplam ${formatTRY(collectionAmount)} TL.`,
              count: collectionDue,
              href: '/dashboard/invoices',
              module: 'invoicing',
              sourceType: 'invoice',
              sourceId: collectionDue === 1 ? collectionDueInvoices[0]?.id ?? null : null,
              actionHref: collectionDue === 1 && collectionDueInvoices[0] ? `/dashboard/invoices/${collectionDueInvoices[0].id}` : '/dashboard/invoices',
              suggestedAction: { type: 'send_mail', label: 'Hatırlatma maili hazırla', href: '/dashboard/mail' },
            }),
          ]
        : []),
      ...(canRead('inventory') && lowStockCount > 0
        ? [
            smartItem({
              id: 'smart:low-stock',
              category: 'low_stock',
              severity: 'critical',
              title: 'Stok kritik seviyede',
              message: `${lowStockCount} stok kalemi minimum seviyenin altında veya sınırında. İlk örnek: ${lowStockItems[0]?.product.code ?? ''} ${lowStockItems[0]?.product.name ?? ''}`.trim(),
              count: lowStockCount,
              href: '/dashboard/stock/levels',
              module: 'inventory',
              sourceType: 'product',
              sourceId: lowStockCount === 1 ? lowStockItems[0]?.productId ?? null : null,
              actionHref: lowStockCount === 1 && lowStockItems[0]?.productId ? `/dashboard/products/${lowStockItems[0].productId}` : '/dashboard/stock/levels',
              suggestedAction: { type: 'create_task', label: 'Satın alma görevi oluştur', href: '/dashboard/workflow' },
            }),
          ]
        : []),
      ...(canRead('approvals') && pendingApprovals > 0
        ? [
            smartItem({
              id: 'smart:pending-approval',
              category: 'pending_approval',
              severity: 'high',
              title: 'Onay bekleyen belge var',
              message: `${pendingApprovals} onay talebi aksiyon bekliyor.`,
              count: pendingApprovals,
              href: '/dashboard/approvals',
              module: 'approvals',
              sourceType: 'approval_request',
              sourceId: null,
              actionHref: '/dashboard/approvals',
              suggestedAction: { type: 'review', label: 'Onaylara git', href: '/dashboard/approvals' },
            }),
          ]
        : []),
      ...(canRead('hr') && pendingLeaves > 0
        ? [
            smartItem({
              id: 'smart:pending-leave',
              category: 'pending_leave',
              severity: 'medium',
              title: 'İzin talebi bekliyor',
              message: `${pendingLeaves} izin talebi değerlendirme bekliyor.`,
              count: pendingLeaves,
              href: '/dashboard/hr/leave-requests',
              module: 'hr',
              sourceType: 'leave_request',
              sourceId: null,
              actionHref: '/dashboard/hr/leave-requests',
              suggestedAction: { type: 'review', label: 'İzinleri incele', href: '/dashboard/hr/leave-requests' },
            }),
          ]
        : []),
      ...(canRead('service') && serviceSlaRisks > 0
        ? [
            smartItem({
              id: 'smart:service-sla',
              category: 'service_sla',
              severity: 'critical',
              title: 'Servis SLA riski',
              message: `${SERVICE_SLA_HOURS} saati aşan ${serviceSlaRisks} açık servis talebi var.`,
              count: serviceSlaRisks,
              href: '/dashboard/service/requests',
              module: 'service',
              sourceType: 'service_request',
              sourceId: null,
              actionHref: '/dashboard/service/requests',
              suggestedAction: { type: 'review', label: 'Servis taleplerine git', href: '/dashboard/service/requests' },
            }),
          ]
        : []),
      ...(canRead('invoicing') && eDocumentErrors > 0
        ? [
            smartItem({
              id: 'smart:edocument-error',
              category: 'edocument_error',
              severity: 'critical',
              title: 'E-belge gönderim hatası',
              message: `${eDocumentErrors} e-belge hata veya red durumunda.`,
              count: eDocumentErrors,
              href: '/dashboard/e-documents',
              module: 'invoicing',
              sourceType: 'edocument',
              sourceId: null,
              actionHref: '/dashboard/e-documents',
              suggestedAction: { type: 'review', label: 'Hataları incele', href: '/dashboard/e-documents' },
            }),
          ]
        : []),
      ...(canRead('mail') && mailFailures > 0
        ? [
            smartItem({
              id: 'smart:mail-failed',
              category: 'mail_failed',
              severity: 'high',
              title: 'Mail gönderimi başarısız',
              message: `${mailFailures} mail gönderimi hata aldı.`,
              count: mailFailures,
              href: '/dashboard/mail',
              module: 'mail',
              sourceType: 'mail_message',
              sourceId: null,
              actionHref: '/dashboard/mail',
              suggestedAction: { type: 'review', label: 'Mail merkezine git', href: '/dashboard/mail' },
            }),
          ]
        : []),
    ]
      .map((item) => applyState(item, stateMap[item.id]))
      .filter((item) => !shouldHideByState(stateMap[item.id], now))
      .sort((a, b) => {
        const rank: Record<SmartNotificationSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return rank[a.severity] - rank[b.severity];
      });

    return {
      items,
      totalCount: items.reduce((total, item) => total + item.count, 0),
      criticalCount: items.filter((item) => item.severity === 'critical').length,
      highCount: items.filter((item) => item.severity === 'high').length,
      mediumCount: items.filter((item) => item.severity === 'medium').length,
    };
  }

  async updateState(
    tenantId: string,
    userId: string,
    id: string,
    action: SmartNotificationAction,
    snoozedUntil?: Date | null,
  ): Promise<SmartNotificationState> {
    const tenantUser = await this.db.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, preferences: true },
    });
    if (!tenantUser) {
      throw new Error('Tenant kullanıcısı bulunamadı.');
    }

    const currentPrefs = isRecord(tenantUser.preferences) ? tenantUser.preferences : {};
    const currentState = parseStateMap(tenantUser.preferences);
    const now = new Date().toISOString();
    const nextState: SmartNotificationState = {
      status:
        action === 'acknowledge' ? 'acknowledged' :
        action === 'complete' ? 'completed' :
        action === 'snooze' ? 'snoozed' :
        action === 'hide' ? 'hidden' :
        'new',
      snoozedUntil: action === 'snooze' ? (snoozedUntil ?? daysFromNow(1)).toISOString() : null,
      updatedAt: now,
    };
    const nextStateMap = toInputStateMap({ ...currentState, [id]: nextState });

    await this.db.tenantUser.update({
      where: { id: tenantUser.id },
      data: {
        preferences: {
          ...currentPrefs,
          [PREF_KEY]: nextStateMap,
        },
      },
    });

    return nextState;
  }
}
