import {
  ApprovalStatus,
  EDocumentStatus,
  InvoiceStatus,
  LeaveStatus,
  MailDeliveryStatus,
  ServiceStatus,
  type PrismaClient,
} from '@prisma/client';

export type SmartNotificationSeverity = 'critical' | 'warning' | 'info';
export type SmartNotificationCategory =
  | 'collection_due'
  | 'low_stock'
  | 'pending_approval'
  | 'pending_leave'
  | 'service_sla'
  | 'edocument_error'
  | 'mail_failed';

export interface SmartNotificationItem {
  id: string;
  category: SmartNotificationCategory;
  severity: SmartNotificationSeverity;
  title: string;
  message: string;
  count: number;
  href: string;
  module: string;
  createdAt: string;
}

export interface SmartNotificationSummary {
  items: SmartNotificationItem[];
  totalCount: number;
  criticalCount: number;
  warningCount: number;
}

const UPCOMING_DAYS = 7;
const SERVICE_SLA_HOURS = 48;

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

function smartItem(input: Omit<SmartNotificationItem, 'createdAt'>): SmartNotificationItem {
  return { ...input, createdAt: new Date().toISOString() };
}

export class SmartNotificationService {
  constructor(private readonly db: PrismaClient) {}

  async getSummary(tenantId: string): Promise<SmartNotificationSummary> {
    const now = new Date();
    const soon = daysFromNow(UPCOMING_DAYS);
    const serviceRiskDate = hoursAgo(SERVICE_SLA_HOURS);

    const [
      collectionDue,
      lowStocks,
      pendingApprovals,
      pendingLeaves,
      serviceSlaRisks,
      eDocumentErrors,
      mailFailures,
    ] = await this.db.$transaction([
      this.db.invoice.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
          dueDate: { gte: now, lte: soon },
        },
      }),
      this.db.stockLevel.findMany({
        where: {
          tenantId,
          product: { deletedAt: null, isActive: true },
        },
        select: {
          id: true,
          quantity: true,
          product: { select: { minStockLevel: true } },
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
        where: { tenantId, status: MailDeliveryStatus.FAILED },
      }),
    ]);

    const lowStockCount = lowStocks.filter((stock) => Number(stock.quantity) <= Number(stock.product.minStockLevel)).length;

    const items: SmartNotificationItem[] = [
      ...(collectionDue > 0
        ? [
            smartItem({
              id: 'smart:collection-due',
              category: 'collection_due',
              severity: 'warning',
              title: 'Tahsilat vadesi yaklaşıyor',
              message: `${UPCOMING_DAYS} gün içinde vadesi gelecek ${collectionDue} fatura var.`,
              count: collectionDue,
              href: '/dashboard/invoices',
              module: 'invoicing',
            }),
          ]
        : []),
      ...(lowStockCount > 0
        ? [
            smartItem({
              id: 'smart:low-stock',
              category: 'low_stock',
              severity: 'critical',
              title: 'Stok kritik seviyede',
              message: `${lowStockCount} stok kalemi minimum seviyenin altında veya sınırında.`,
              count: lowStockCount,
              href: '/dashboard/stock/levels',
              module: 'inventory',
            }),
          ]
        : []),
      ...(pendingApprovals > 0
        ? [
            smartItem({
              id: 'smart:pending-approval',
              category: 'pending_approval',
              severity: 'warning',
              title: 'Onay bekleyen belge var',
              message: `${pendingApprovals} onay talebi aksiyon bekliyor.`,
              count: pendingApprovals,
              href: '/dashboard/approvals',
              module: 'approvals',
            }),
          ]
        : []),
      ...(pendingLeaves > 0
        ? [
            smartItem({
              id: 'smart:pending-leave',
              category: 'pending_leave',
              severity: 'info',
              title: 'İzin talebi bekliyor',
              message: `${pendingLeaves} izin talebi değerlendirme bekliyor.`,
              count: pendingLeaves,
              href: '/dashboard/hr/leave-requests',
              module: 'hr',
            }),
          ]
        : []),
      ...(serviceSlaRisks > 0
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
            }),
          ]
        : []),
      ...(eDocumentErrors > 0
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
            }),
          ]
        : []),
      ...(mailFailures > 0
        ? [
            smartItem({
              id: 'smart:mail-failed',
              category: 'mail_failed',
              severity: 'warning',
              title: 'Mail gönderimi başarısız',
              message: `${mailFailures} mail gönderimi hata aldı.`,
              count: mailFailures,
              href: '/dashboard/mail',
              module: 'mail',
            }),
          ]
        : []),
    ];

    return {
      items,
      totalCount: items.reduce((total, item) => total + item.count, 0),
      criticalCount: items.filter((item) => item.severity === 'critical').length,
      warningCount: items.filter((item) => item.severity === 'warning').length,
    };
  }
}
