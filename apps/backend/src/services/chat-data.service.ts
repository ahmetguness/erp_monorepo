import { prisma } from '../lib/prisma';
import { InvoiceStatus, InvoiceType, PaymentStatus } from '@prisma/client';

/**
 * Chatbot'un ERP verilerine erişimi için servis katmanı.
 * Doğrudan Prisma kullanarak ERP verilerine erişir.
 *
 * Kurallar:
 * - tenantId her zaman parametre olarak alınır (JWT'den gelir)
 * - Sadece okuma işlemleri
 * - Yanıtlar sınırlı (max 50 kayıt) — AI context window koruması
 */

export const ChatDataService = {
  /** Son faturalar */
  async getInvoices(tenantId: string, limit = 20) {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId },
      select: {
        id: true, number: true, date: true, dueDate: true,
        status: true, type: true, totalGross: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: Math.min(limit, 50),
    });
    return { data: invoices, count: invoices.length };
  },

  /** Gecikmiş faturalar */
  async getOverdueInvoices(tenantId: string) {
    const overdue = await prisma.invoice.findMany({
      where: { tenantId, status: InvoiceStatus.OVERDUE },
      select: {
        number: true, date: true, dueDate: true, totalGross: true,
        contact: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 30,
    });
    return {
      data: overdue,
      count: overdue.length,
      totalOverdue: overdue.reduce((s, i) => s + Number(i.totalGross), 0),
    };
  },

  /** Gelir özeti (dönem bazlı) */
  async getRevenue(tenantId: string, dateFrom: string, dateTo: string) {
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.SALES,
        status: { not: InvoiceStatus.CANCELLED },
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
      },
      select: { totalNet: true, totalTax: true, totalGross: true },
    });
    return {
      data: {
        period: { from: dateFrom, to: dateTo },
        invoiceCount: invoices.length,
        totalNet: invoices.reduce((s, i) => s + Number(i.totalNet), 0),
        totalGross: invoices.reduce((s, i) => s + Number(i.totalGross), 0),
      },
    };
  },

  /** Gider özeti (dönem bazlı) */
  async getExpenses(tenantId: string, dateFrom: string, dateTo: string) {
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.PURCHASE,
        status: { not: InvoiceStatus.CANCELLED },
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
      },
      select: { totalNet: true, totalTax: true, totalGross: true },
    });
    return {
      data: {
        period: { from: dateFrom, to: dateTo },
        invoiceCount: invoices.length,
        totalNet: invoices.reduce((s, i) => s + Number(i.totalNet), 0),
        totalGross: invoices.reduce((s, i) => s + Number(i.totalGross), 0),
      },
    };
  },

  /** Cari bakiyeler */
  async getBalances(tenantId: string) {
    const contacts = await prisma.contact.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        id: true, name: true, code: true, type: true,
        accountEntries: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { balance: true, date: true },
        },
      },
      take: 50,
    });

    const result = contacts
      .map((ct) => ({
        name: ct.name, code: ct.code, type: ct.type,
        balance: ct.accountEntries[0] ? Number(ct.accountEntries[0].balance) : 0,
      }))
      .filter((ct) => ct.balance !== 0);

    const totalReceivable = result.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);
    const totalPayable = result.filter((r) => r.balance < 0).reduce((s, r) => s + Math.abs(r.balance), 0);

    return { data: { contacts: result, summary: { totalReceivable, totalPayable } } };
  },

  /** Stok durumu */
  async getStock(tenantId: string) {
    const stockLevels = await prisma.stockLevel.findMany({
      where: { tenantId, quantity: { gt: 0 } },
      include: {
        product: { select: { code: true, name: true, minStockLevel: true, averageCost: true } },
        warehouse: { select: { name: true } },
      },
      take: 50,
    });

    const belowMin = stockLevels.filter(
      (sl) => Number(sl.quantity) < Number(sl.product.minStockLevel),
    );

    return {
      data: {
        totalItems: stockLevels.length,
        belowMinStockCount: belowMin.length,
        totalStockValue: stockLevels.reduce(
          (s, sl) => s + Number(sl.quantity) * Number(sl.product.averageCost), 0,
        ),
        belowMinStock: belowMin.map((sl) => ({
          product: sl.product.name, warehouse: sl.warehouse.name,
          quantity: Number(sl.quantity), minLevel: Number(sl.product.minStockLevel),
        })),
      },
    };
  },

  /** Satış siparişleri */
  async getSalesOrders(tenantId: string) {
    const orders = await prisma.salesOrder.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        number: true, date: true, dueDate: true, status: true,
        totalGross: true, invoicedAmount: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
    return { data: orders, count: orders.length };
  },

  /** Bekleyen ödemeler */
  async getPendingPayments(tenantId: string) {
    const payments = await prisma.payment.findMany({
      where: { tenantId, deletedAt: null, status: PaymentStatus.PENDING },
      select: {
        date: true, amount: true, method: true, reference: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 30,
    });
    const totalPending = payments.reduce((s, p) => s + Number(p.amount), 0);
    return { data: payments, count: payments.length, totalPending };
  },

  /** Satın alma siparişleri */
  async getPurchaseOrders(tenantId: string) {
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        number: true, date: true, dueDate: true, status: true, totalGross: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
    return { data: orders, count: orders.length };
  },

  /** Açık servis talepleri */
  async getOpenServiceRequests(tenantId: string) {
    const requests = await prisma.serviceRequest.findMany({
      where: {
        tenantId, deletedAt: null,
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_CUSTOMER'] },
      },
      select: {
        number: true, subject: true, status: true, priority: true, createdAt: true,
        contact: { select: { name: true } },
        customerAsset: { select: { name: true, brand: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { data: requests, count: requests.length };
  },

  /** Çek/senet durumu */
  async getDueChecks(tenantId: string) {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const checks = await prisma.checkPromissoryNote.findMany({
      where: {
        tenantId, deletedAt: null,
        status: { in: ['PENDING', 'DEPOSITED'] },
        dueDate: { lte: thirtyDaysLater },
      },
      select: {
        number: true, type: true, amount: true, dueDate: true, bankName: true, status: true,
      },
      orderBy: { dueDate: 'asc' },
      take: 30,
    });

    const overdue = checks.filter((ch) => new Date(ch.dueDate) < now);
    const upcoming = checks.filter((ch) => new Date(ch.dueDate) >= now);

    return {
      data: {
        overdue, upcoming,
        totalOverdue: overdue.reduce((s, ch) => s + Number(ch.amount), 0),
        totalUpcoming: upcoming.reduce((s, ch) => s + Number(ch.amount), 0),
      },
    };
  },

  /** Bekleyen izin talepleri */
  async getPendingLeaves(tenantId: string) {
    const leaves = await prisma.leaveRequest.findMany({
      where: { tenantId, deletedAt: null, status: 'PENDING' },
      select: {
        type: true, startDate: true, endDate: true, days: true, status: true,
        employee: { select: { firstName: true, lastName: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { data: leaves, count: leaves.length };
  },

  /** Açık iş emirleri */
  async getOpenWorkOrders(tenantId: string) {
    const workOrders = await prisma.workOrder.findMany({
      where: {
        tenantId, deletedAt: null,
        status: { in: ['PLANNED', 'IN_PROGRESS', 'PAUSED'] },
      },
      select: {
        number: true, status: true, plannedQty: true, producedQty: true,
        startDate: true, endDate: true,
        product: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { data: workOrders, count: workOrders.length };
  },

  /** Pazaryeri siparişleri */
  async getMarketplaceOrders(tenantId: string) {
    const orders = await prisma.marketplaceOrder.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      select: {
        externalId: true, channel: true, status: true,
        customerName: true, totalAmount: true, orderDate: true,
      },
      orderBy: { orderDate: 'desc' },
      take: 30,
    });
    return { data: orders, count: orders.length };
  },

  /** Günlük özet */
  async getDailySummary(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayInvoices, overdueInvoices, pendingPayments, openOrders] = await Promise.all([
      prisma.invoice.count({
        where: { tenantId, date: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } },
      }),
      prisma.invoice.count({
        where: { tenantId, status: 'OVERDUE' },
      }),
      prisma.payment.count({
        where: { tenantId, deletedAt: null, status: 'PENDING' },
      }),
      prisma.salesOrder.count({
        where: { tenantId, deletedAt: null, status: { in: ['DRAFT', 'CONFIRMED'] } },
      }),
    ]);

    // Minimum stok altı hesapla
    const levels = await prisma.stockLevel.findMany({
      where: { tenantId, quantity: { gt: 0 } },
      include: { product: { select: { minStockLevel: true } } },
    });
    const lowStockItems = levels.filter(
      (sl) => Number(sl.quantity) < Number(sl.product.minStockLevel),
    ).length;

    return {
      data: { todayInvoices, overdueInvoices, pendingPayments, openOrders, lowStockItems },
    };
  },

  /** Personel listesi */
  async getEmployees(tenantId: string) {
    const employees = await prisma.employee.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        firstName: true, lastName: true, email: true, phone: true,
        position: true, department: true, hireDate: true,
      },
      orderBy: { firstName: 'asc' },
      take: 50,
    });
    return { data: employees, count: employees.length };
  },

  /** Personel özeti (departman dağılımı vb.) */
  async getEmployeeSummary(tenantId: string) {
    const employees = await prisma.employee.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { department: true, position: true, hireDate: true },
    });

    const departmentCounts: Record<string, number> = {};
    for (const emp of employees) {
      const dept = emp.department ?? 'Belirtilmemiş';
      departmentCounts[dept] = (departmentCounts[dept] ?? 0) + 1;
    }

    const departments = Object.entries(departmentCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      data: {
        totalEmployees: employees.length,
        departments,
      },
    };
  },
};
