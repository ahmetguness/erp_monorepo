import { prisma } from '../../lib/prisma';
import { InvoiceStatus, InvoiceType, PaymentStatus, Prisma, PurchaseRequestStatus } from '@prisma/client';
import { generateDocumentNumber } from '../../utils/generate-number.js';
import { getCurrentPeriod, getMonthStartDate, groupByDepartment } from './shared.js';
import type { LowStockPurchaseAdjustment, LowStockPurchaseRequestOptions } from './shared.js';

export const operationsChatDataService = {
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
    const now = new Date();

    const [
      todayInvoices, todayInvoiceData,
      overdueInvoices, overdueInvoiceData,
      pendingPayments, pendingPaymentData,
      openOrders,
    ] = await Promise.all([
      prisma.invoice.count({
        where: { tenantId, date: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } },
      }),
      prisma.invoice.findMany({
        where: { tenantId, date: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } },
        select: { totalGross: true, type: true },
      }),
      prisma.invoice.count({
        where: {
          tenantId,
          OR: [
            { status: 'OVERDUE' },
            { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now } },
          ],
        },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId,
          OR: [
            { status: 'OVERDUE' },
            { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now } },
          ],
        },
        select: { totalGross: true },
      }),
      prisma.payment.count({
        where: { tenantId, deletedAt: null, status: 'PENDING' },
      }),
      prisma.payment.findMany({
        where: { tenantId, deletedAt: null, status: 'PENDING' },
        select: { amount: true },
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

    const todaySalesTotal = todayInvoiceData
      .filter((i) => i.type === 'SALES')
      .reduce((s, i) => s + Number(i.totalGross), 0);
    const todayPurchaseTotal = todayInvoiceData
      .filter((i) => i.type === 'PURCHASE')
      .reduce((s, i) => s + Number(i.totalGross), 0);
    const overdueTotal = overdueInvoiceData.reduce((s, i) => s + Number(i.totalGross), 0);
    const pendingPaymentTotal = pendingPaymentData.reduce((s, p) => s + Number(p.amount), 0);

    return {
      data: {
        todayInvoices,
        todaySalesTotal,
        todayPurchaseTotal,
        overdueInvoices,
        overdueTotal,
        pendingPayments,
        pendingPaymentTotal,
        openOrders,
        lowStockItems,
      },
    };
  },

  /** Personel listesi */
  async getSalesQuotes(tenantId: string) {
    const quotes = await prisma.salesQuote.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        number: true, date: true, status: true, totalGross: true, validUntil: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
    return { data: quotes, count: quotes.length };
  },

  /** Satın alma talepleri */
  async getPurchaseRequests(tenantId: string) {
    const requests = await prisma.purchaseRequest.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        number: true, date: true, status: true, totalEstimated: true,
        _count: { select: { items: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
    return { data: requests, count: requests.length };
  },

  /** İrsaliyeler */
  async getDeliveryNotes(tenantId: string) {
    const notes = await prisma.deliveryNote.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        number: true, type: true, status: true, date: true, trackingNumber: true, carrier: true,
        contact: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
    return { data: notes, count: notes.length };
  },

  /** Banka hareketleri */
  async getEDocuments(tenantId: string) {
    const docs = await prisma.eDocument.findMany({
      where: { tenantId },
      select: {
        type: true, status: true, uuid: true, createdAt: true, sentAt: true,
        invoice: { select: { number: true, totalGross: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { data: docs, count: docs.length };
  },

  /** Hesap planı */
  async getBOMs(tenantId: string) {
    const boms = await prisma.bOM.findMany({
      where: { tenantId },
      select: {
        name: true, version: true, isActive: true,
        product: { select: { name: true, code: true } },
        _count: { select: { items: true } },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
    return { data: boms, count: boms.length };
  },

  /** Müşteri varlıkları */
  async getCustomerAssets(tenantId: string) {
    const assets = await prisma.customerAsset.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        name: true, brand: true, model: true, serialNo: true, warrantyEnd: true,
        contact: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
      take: 30,
    });
    return { data: assets, count: assets.length };
  },

  /** Pazaryeri entegrasyonları */
  async getMarketplaceIntegrations(tenantId: string) {
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: { tenantId },
      select: { channel: true, name: true, isActive: true, lastSyncAt: true },
    });
    return { data: integrations, count: integrations.length };
  },
} as const;
