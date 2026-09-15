import { Context } from 'hono';
import {
  ApprovalStatus,
  InvoiceStatus,
  InvoiceType,
  NotificationStatus,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId, requireUserId } from '../../../../utils/context.js';

export interface MobileDashboardActivity {
  id: string;
  type: 'INVOICE' | 'ORDER' | 'APPROVAL' | 'PAYMENT' | 'STOCK' | 'SYSTEM';
  title: string;
  subtitle: string;
  timestamp: string;
  status: string;
  module: string;
}

export const MobileDashboardController = {
  async getDashboard(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const yesterdayEnd = new Date(todayEnd.getTime() - 86400000);

    // Concurrent queries for max performance
    const [
      todayInvoices,
      yesterdayInvoices,
      completedPayments,
      overdueInvoices,
      pendingOrders,
      pendingApprovals,
      stockLevels,
      recentInvoices,
      recentApprovals,
      unreadNotificationCount,
    ] = await Promise.all([
      // 1. Today sales
      prisma.invoice.findMany({
        where: {
          tenantId,
          type: InvoiceType.SALES,
          status: { not: InvoiceStatus.CANCELLED },
          date: { gte: todayStart, lte: todayEnd },
          deletedAt: null,
        },
        select: { totalGross: true },
      }),
      // 2. Yesterday sales
      prisma.invoice.findMany({
        where: {
          tenantId,
          type: InvoiceType.SALES,
          status: { not: InvoiceStatus.CANCELLED },
          date: { gte: yesterdayStart, lte: yesterdayEnd },
          deletedAt: null,
        },
        select: { totalGross: true },
      }),
      // 3. Completed payments (net cash & bank balance)
      prisma.payment.findMany({
        where: {
          tenantId,
          status: PaymentStatus.COMPLETED,
          deletedAt: null,
        },
        select: { amount: true, direction: true },
      }),
      // 4. Overdue Receivables
      prisma.invoice.findMany({
        where: {
          tenantId,
          type: InvoiceType.SALES,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
          dueDate: { lt: now },
          deletedAt: null,
        },
        select: {
          totalGross: true,
          payments: {
            select: { amount: true },
          },
        },
      }),
      // 5. Pending Orders (confirmed or partially delivered)
      prisma.salesOrder.count({
        where: {
          tenantId,
          status: { in: [OrderStatus.CONFIRMED, OrderStatus.PARTIALLY_DELIVERED] },
          deletedAt: null,
        },
      }),
      // 6. Pending Approvals
      prisma.approvalRequest.count({
        where: {
          tenantId,
          status: ApprovalStatus.PENDING,
        },
      }),
      // 7. Stock Levels for critical low stock count
      prisma.stockLevel.findMany({
        where: { tenantId },
        select: {
          quantity: true,
          product: { select: { minStockLevel: true } },
        },
      }),
      // 8. Recent Invoices for Activity Stream
      prisma.invoice.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          number: true,
          totalGross: true,
          status: true,
          type: true,
          createdAt: true,
          contact: { select: { name: true } },
        },
      }),
      // 9. Recent Approvals for Activity Stream
      prisma.approvalRequest.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          createdAt: true,
          flow: { select: { name: true, module: true } },
        },
      }),
      // 10. Unread notifications
      prisma.notification.count({
        where: { tenantId, userId, status: NotificationStatus.UNREAD },
      }),
    ]);

    // ── Compute KPI Metrics ──
    const todayGross = todayInvoices.reduce((acc, inv) => acc + Number(inv.totalGross), 0);
    const todayCount = todayInvoices.length;
    const yesterdayGross = yesterdayInvoices.reduce((acc, inv) => acc + Number(inv.totalGross), 0);

    const changePercent =
      yesterdayGross > 0
        ? Math.round(((todayGross - yesterdayGross) / yesterdayGross) * 100)
        : todayGross > 0
          ? 100
          : 0;

    const cashBankTotal = completedPayments.reduce((acc, p) => {
      const amt = Number(p.amount);
      return p.direction === 'RECEIVE' ? acc + amt : acc - amt;
    }, 0);

    const overdueTotal = overdueInvoices.reduce((acc, inv) => {
      const paid = inv.payments.reduce((pAcc, p) => pAcc + Number(p.amount), 0);
      const remaining = Number(inv.totalGross) - paid;
      return acc + (remaining > 0 ? remaining : 0);
    }, 0);
    const overdueCount = overdueInvoices.length;

    const criticalStockCount = stockLevels.filter(
      (sl) => sl.product && Number(sl.quantity) < Number(sl.product.minStockLevel),
    ).length;

    // ── Build Activity Stream ──
    const activities: MobileDashboardActivity[] = [];

    for (const inv of recentInvoices) {
      activities.push({
        id: `inv-${inv.id}`,
        type: 'INVOICE',
        title: inv.type === InvoiceType.SALES ? 'Satış Faturası' : 'Alış Faturası',
        subtitle: `${inv.number} • ${inv.contact?.name || 'Müşteri'} • ₺${Number(inv.totalGross).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
        timestamp: inv.createdAt.toISOString(),
        status: inv.status,
        module: 'invoicing',
      });
    }

    for (const appr of recentApprovals) {
      activities.push({
        id: `appr-${appr.id}`,
        type: 'APPROVAL',
        title: appr.flow?.name || 'Onay Talebi',
        subtitle: `Durum: ${appr.status === 'PENDING' ? 'Bekliyor' : appr.status === 'APPROVED' ? 'Onaylandı' : 'Reddedildi'}`,
        timestamp: appr.createdAt.toISOString(),
        status: appr.status,
        module: appr.flow?.module || 'approvals',
      });
    }

    // Sort by timestamp desc
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return c.json({
      data: {
        salesSummary: {
          todayGross,
          todayCount,
          yesterdayGross,
          changePercent,
          targetProgress: Math.min(100, Math.round((todayGross / 50000) * 100)), // dynamic target relative to 50k daily milestone
        },
        financeSummary: {
          cashBankTotal,
          overdueTotal,
          overdueCount,
        },
        operationsSummary: {
          pendingOrders,
          criticalStockCount,
          pendingApprovals,
        },
        activities: activities.slice(0, 10),
        unreadNotificationCount,
      },
    });
  },
};
