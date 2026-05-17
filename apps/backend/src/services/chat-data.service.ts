import { prisma } from '../lib/prisma';
import { InvoiceStatus, InvoiceType, PaymentStatus, Prisma, PurchaseRequestStatus } from '@prisma/client';
import { generateDocumentNumber } from '../utils/generate-number.js';

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
    const now = new Date();
    const overdue = await prisma.invoice.findMany({
      where: {
        tenantId,
        OR: [
          { status: InvoiceStatus.OVERDUE },
          {
            status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
            dueDate: { lt: now },
          },
        ],
      },
      select: {
        number: true, date: true, dueDate: true, totalGross: true, status: true,
        contact: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 30,
    });

    const totalOverdue = overdue.reduce((s, i) => s + Number(i.totalGross), 0);
    const daysOverdueList = overdue.map((i) => {
      const due = i.dueDate ? new Date(i.dueDate) : now;
      const daysLate = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        number: i.number,
        contact: i.contact?.name ?? '—',
        totalGross: Number(i.totalGross),
        dueDate: i.dueDate,
        status: i.status,
        daysLate,
      };
    });

    return {
      data: daysOverdueList,
      count: overdue.length,
      totalOverdue,
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
        creditLimit: true, paymentTermDays: true,
        accountEntries: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { balance: true, date: true },
        },
      },
      take: 50,
    });

    const result = contacts
      .map((ct) => {
        const balance = ct.accountEntries[0] ? Number(ct.accountEntries[0].balance) : 0;
        const creditLimit = ct.creditLimit ? Number(ct.creditLimit) : null;
        const overCreditLimit = creditLimit !== null && balance > creditLimit;
        return {
          name: ct.name, code: ct.code, type: ct.type,
          balance,
          creditLimit,
          paymentTermDays: ct.paymentTermDays,
          overCreditLimit,
        };
      })
      .filter((ct) => ct.balance !== 0);

    const totalReceivable = result.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);
    const totalPayable = result.filter((r) => r.balance < 0).reduce((s, r) => s + Math.abs(r.balance), 0);
    const riskyContacts = result.filter((r) => r.overCreditLimit);

    return {
      data: {
        contacts: result,
        riskyContacts,
        summary: {
          totalReceivable,
          totalPayable,
          riskyCount: riskyContacts.length,
        },
      },
    };
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

  /** Belirli cari için son faturaları özetler */
  async summarizeContactRecentInvoices(tenantId: string, contactName: string, limit = 3) {
    const search = contactName.trim();
    if (!search) return { data: null, message: 'Cari adı belirtilmedi.' };

    const contact = await prisma.contact.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, code: true, type: true },
    });

    if (!contact) return { data: null, message: `"${search}" ile eşleşen cari bulunamadı.` };

    const safeLimit = Math.max(1, Math.min(limit, 10));
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, contactId: contact.id, deletedAt: null },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        date: true,
        dueDate: true,
        totalNet: true,
        totalTax: true,
        totalGross: true,
        notes: true,
      },
      orderBy: { date: 'desc' },
      take: safeLimit,
    });

    const totalGross = invoices.reduce((sum, invoice) => sum + Number(invoice.totalGross), 0);
    const openTotal = invoices
      .filter((invoice) => invoice.status !== InvoiceStatus.PAID && invoice.status !== InvoiceStatus.CANCELLED)
      .reduce((sum, invoice) => sum + Number(invoice.totalGross), 0);

    return {
      data: {
        contact,
        invoiceCount: invoices.length,
        totalGross,
        openTotal,
        invoices: invoices.map((invoice) => ({
          ...invoice,
          totalNet: Number(invoice.totalNet),
          totalTax: Number(invoice.totalTax),
          totalGross: Number(invoice.totalGross),
        })),
      },
    };
  },

  /** Vadesi geçmiş faturalar için mail taslakları hazırlar; mail göndermez. */
  async draftOverdueInvoiceReminders(tenantId: string, limit = 10) {
    const now = new Date();
    const safeLimit = Math.max(1, Math.min(limit, 25));

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        type: InvoiceType.SALES,
        OR: [
          { status: InvoiceStatus.OVERDUE },
          {
            status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
            dueDate: { lt: now },
          },
        ],
      },
      select: {
        id: true,
        number: true,
        dueDate: true,
        totalGross: true,
        contact: { select: { name: true, email: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: safeLimit,
    });

    const drafts = invoices.map((invoice) => {
      const dueDate = invoice.dueDate ?? now;
      const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000));
      const amount = Number(invoice.totalGross);
      const contactName = invoice.contact?.name ?? 'Müşterimiz';

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        to: invoice.contact?.email ?? null,
        contactName,
        amount,
        dueDate,
        daysLate,
        subject: `${invoice.number} numaralı fatura ödeme hatırlatması`,
        body:
          `Merhaba ${contactName},\n\n` +
          `${invoice.number} numaralı ve ${amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} tutarındaki faturanızın vadesi ${daysLate} gün önce dolmuştur.\n` +
          `Ödemeniz yapıldıysa bu mesajı dikkate almayabilirsiniz. Destek ihtiyacınız olursa bizimle iletişime geçebilirsiniz.\n\n` +
          `İyi çalışmalar.`,
      };
    });

    return {
      data: drafts,
      count: drafts.length,
      missingEmailCount: drafts.filter((draft) => !draft.to).length,
    };
  },

  /** Nakit akışı riskini gelir, gider, geciken tahsilat ve bekleyen ödemelerle tahmin eder. */
  async forecastCashFlowRisk(tenantId: string, dateFrom: string, dateTo: string) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 86_400_000);

    const [salesInvoices, purchaseInvoices, overdueInvoices, pendingPayments, dueChecks] = await prisma.$transaction([
      prisma.invoice.findMany({
        where: { tenantId, deletedAt: null, type: InvoiceType.SALES, status: { not: InvoiceStatus.CANCELLED }, date: { gte: from, lte: to } },
        select: { totalGross: true },
      }),
      prisma.invoice.findMany({
        where: { tenantId, deletedAt: null, type: InvoiceType.PURCHASE, status: { not: InvoiceStatus.CANCELLED }, date: { gte: from, lte: to } },
        select: { totalGross: true },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          type: InvoiceType.SALES,
          OR: [
            { status: InvoiceStatus.OVERDUE },
            { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { lt: now } },
          ],
        },
        select: { totalGross: true },
      }),
      prisma.payment.findMany({
        where: { tenantId, deletedAt: null, status: PaymentStatus.PENDING },
        select: { amount: true },
      }),
      prisma.checkPromissoryNote.findMany({
        where: { tenantId, deletedAt: null, status: { in: ['PENDING', 'DEPOSITED'] }, dueDate: { lte: thirtyDaysLater } },
        select: { amount: true },
      }),
    ]);

    const salesTotal = salesInvoices.reduce((sum, item) => sum + Number(item.totalGross), 0);
    const purchaseTotal = purchaseInvoices.reduce((sum, item) => sum + Number(item.totalGross), 0);
    const overdueTotal = overdueInvoices.reduce((sum, item) => sum + Number(item.totalGross), 0);
    const pendingPaymentTotal = pendingPayments.reduce((sum, item) => sum + Number(item.amount), 0);
    const dueCheckTotal = dueChecks.reduce((sum, item) => sum + Number(item.amount), 0);
    const netForecast = salesTotal - purchaseTotal - pendingPaymentTotal - dueCheckTotal;
    const pressure = overdueTotal + pendingPaymentTotal + dueCheckTotal;
    const riskScore = Math.min(100, Math.round((pressure / Math.max(1, salesTotal + overdueTotal)) * 100));
    const riskLevel = netForecast < 0 || riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';

    return {
      data: {
        period: { from: dateFrom, to: dateTo },
        salesTotal,
        purchaseTotal,
        overdueTotal,
        pendingPaymentTotal,
        dueCheckTotal,
        netForecast,
        riskScore,
        riskLevel,
        signals: [
          ...(overdueTotal > 0 ? [`Geciken tahsilat: ${overdueTotal.toFixed(2)} TRY`] : []),
          ...(pendingPaymentTotal > 0 ? [`Bekleyen ödeme: ${pendingPaymentTotal.toFixed(2)} TRY`] : []),
          ...(dueCheckTotal > 0 ? [`30 gün içindeki çek/senet: ${dueCheckTotal.toFixed(2)} TRY`] : []),
          ...(netForecast < 0 ? ['Dönem net nakit projeksiyonu negatif.'] : []),
        ],
      },
    };
  },

  /** Kritik stoktan taslak satın alma talebi oluşturur */
  async createPurchaseRequestFromLowStock(tenantId: string, limit = 10, note?: string) {
    const safeLimit = Math.max(1, Math.min(limit, 25));

    const stockLevels = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        product: {
          tenantId,
          deletedAt: null,
          isActive: true,
          minStockLevel: { gt: 0 },
        },
      },
      select: {
        productId: true,
        quantity: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            minStockLevel: true,
            purchasePrice: true,
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 250,
    });

    const byProduct = new Map<
      string,
      {
        productId: string;
        code: string;
        name: string;
        minStockLevel: number;
        purchasePrice: number;
        quantity: number;
      }
    >();

    for (const level of stockLevels) {
      const current = byProduct.get(level.productId);
      const quantity = Number(level.quantity);
      if (current) {
        current.quantity += quantity;
      } else {
        byProduct.set(level.productId, {
          productId: level.product.id,
          code: level.product.code,
          name: level.product.name,
          minStockLevel: Number(level.product.minStockLevel),
          purchasePrice: Number(level.product.purchasePrice),
          quantity,
        });
      }
    }

    const items = [...byProduct.values()]
      .map((item) => ({
        ...item,
        suggestedQuantity: Math.max(0, Math.ceil(item.minStockLevel - item.quantity)),
      }))
      .filter((item) => item.suggestedQuantity > 0)
      .sort((a, b) => b.suggestedQuantity - a.suggestedQuantity)
      .slice(0, safeLimit);

    if (items.length === 0) {
      return {
        created: false,
        message: 'Minimum stok seviyesinin altında ürün bulunamadı; satın alma talebi oluşturulmadı.',
      };
    }

    const number = await generateDocumentNumber(tenantId, 'purchase_request', 'PR-', 'purchaseRequest');
    const totalEstimated = items.reduce((sum, item) => sum + item.purchasePrice * item.suggestedQuantity, 0);

    const request = await prisma.purchaseRequest.create({
      data: {
        tenantId,
        number,
        date: new Date(),
        status: PurchaseRequestStatus.DRAFT,
        notes: note?.trim() || 'AI önerisi: kritik stok seviyesinin altındaki ürünler için otomatik taslak.',
        totalEstimated: totalEstimated > 0 ? totalEstimated : null,
        items: {
          create: items.map((item) => ({
            tenantId,
            productId: item.productId,
            description: `${item.code} - ${item.name}`,
            quantity: item.suggestedQuantity,
            unitPrice: item.purchasePrice > 0 ? item.purchasePrice : null,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return {
      created: true,
      request: {
        id: request.id,
        number: request.number,
        status: request.status,
        itemCount: request.items.length,
        totalEstimated: request.totalEstimated ? Number(request.totalEstimated) : null,
      },
      items: items.map((item) => ({
        product: item.name,
        code: item.code,
        currentQuantity: item.quantity,
        minStockLevel: item.minStockLevel,
        suggestedQuantity: item.suggestedQuantity,
      })),
      nextAction: 'Satın alma talepleri ekranında taslağı inceleyip onay akışına gönderebilirsiniz.',
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

  /** Belirli personelin bordro geçmişi */
  async getEmployeePayroll(tenantId: string, employeeName: string) {
    // İsmi kelimelere ayır, gereksiz kelimeleri temizle
    const stopWords = ['hanım', 'bey', 'hanımın', 'beyin', "hanım'ın", "bey'in", 'nın', 'nin', 'ın', 'in', 'un', 'ün'];
    const words = employeeName
      .split(/\s+/)
      .map((w) => w.replace(/[''`]/g, '').toLowerCase())
      .filter((w) => w.length > 1 && !stopWords.includes(w));

    if (words.length === 0) {
      return { data: null, message: 'Geçerli bir personel adı belirtilmedi.' };
    }

    // Her kelimeyi firstName veya lastName'de ara (AND mantığı)
    const employees = await prisma.employee.findMany({
      where: {
        tenantId, deletedAt: null, isActive: true,
        AND: words.map((word) => ({
          OR: [
            { firstName: { contains: word, mode: 'insensitive' as const } },
            { lastName: { contains: word, mode: 'insensitive' as const } },
          ],
        })),
      },
      select: { id: true, firstName: true, lastName: true },
    });

    if (employees.length === 0) {
      return { data: null, message: `"${employeeName}" ile eşleşen personel bulunamadı.` };
    }

    // İlk eşleşen personelin bordro kayıtlarını getir
    const employee = employees[0];
    const payrolls = await prisma.payroll.findMany({
      where: { tenantId, employeeId: employee.id, deletedAt: null },
      select: {
        period: true, grossSalary: true, deductions: true, netSalary: true, paidAt: true,
        items: { select: { label: true, amount: true, isDeduction: true } },
      },
      orderBy: { period: 'desc' },
      take: 12,
    });

    return {
      data: {
        employee: { name: `${employee.firstName} ${employee.lastName}` },
        payrolls: payrolls.map((p) => ({
          period: p.period,
          grossSalary: Number(p.grossSalary),
          deductions: Number(p.deductions),
          netSalary: Number(p.netSalary),
          paid: !!p.paidAt,
          items: p.items.map((i) => ({
            label: i.label, amount: Number(i.amount), isDeduction: i.isDeduction,
          })),
        })),
        totalRecords: payrolls.length,
        ...(payrolls.length === 0 && { message: `${employee.firstName} ${employee.lastName} için henüz bordro kaydı bulunmuyor.` }),
      },
    };
  },

  /** Dönem bazlı bordro özeti */
  async getPayrollSummary(tenantId: string, period?: string) {
    // period="all" → tüm dönemler, period=undefined → bu ay, period="2026-03" → belirli dönem
    const isAll = period === 'all';
    const targetPeriod = isAll ? undefined : (period ?? getCurrentPeriod());

    const payrolls = await prisma.payroll.findMany({
      where: {
        tenantId, deletedAt: null,
        ...(targetPeriod && { period: targetPeriod }),
      },
      select: {
        period: true, grossSalary: true, deductions: true, netSalary: true, paidAt: true,
        employee: { select: { firstName: true, lastName: true, department: true } },
      },
    });

    const totalGross = payrolls.reduce((s, p) => s + Number(p.grossSalary), 0);
    const totalDeductions = payrolls.reduce((s, p) => s + Number(p.deductions), 0);
    const totalNet = payrolls.reduce((s, p) => s + Number(p.netSalary), 0);
    const paidCount = payrolls.filter((p) => p.paidAt).length;

    // Dönem bazlı kırılım
    const byPeriod: Record<string, { gross: number; net: number; count: number }> = {};
    for (const p of payrolls) {
      if (!byPeriod[p.period]) byPeriod[p.period] = { gross: 0, net: 0, count: 0 };
      byPeriod[p.period].gross += Number(p.grossSalary);
      byPeriod[p.period].net += Number(p.netSalary);
      byPeriod[p.period].count++;
    }

    return {
      data: {
        period: isAll ? 'Tüm dönemler' : targetPeriod,
        employeeCount: payrolls.length,
        totalGross, totalDeductions, totalNet,
        paidCount, unpaidCount: payrolls.length - paidCount,
        byDepartment: groupByDepartment(payrolls),
        ...(isAll && { byPeriod: Object.entries(byPeriod).map(([p, d]) => ({ period: p, ...d })).sort((a, b) => b.period.localeCompare(a.period)) }),
      },
    };
  },

  /** Puantaj özeti */
  async getAttendanceSummary(tenantId: string, dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(dateFrom) : getMonthStartDate();
    const to = dateTo ? new Date(dateTo) : new Date();

    const attendances = await prisma.attendance.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      select: {
        date: true, checkIn: true, checkOut: true, overtimeHours: true,
        employee: { select: { firstName: true, lastName: true, department: true } },
      },
      orderBy: { date: 'desc' },
      take: 100,
    });

    const totalOvertime = attendances.reduce((s, a) => s + Number(a.overtimeHours), 0);
    const uniqueEmployees = new Set(attendances.map((a) => `${a.employee.firstName} ${a.employee.lastName}`)).size;

    return {
      data: {
        period: { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] },
        totalRecords: attendances.length,
        uniqueEmployees,
        totalOvertimeHours: totalOvertime,
        records: attendances.slice(0, 30).map((a) => ({
          employee: `${a.employee.firstName} ${a.employee.lastName}`,
          department: a.employee.department,
          date: a.date,
          checkIn: a.checkIn, checkOut: a.checkOut,
          overtimeHours: Number(a.overtimeHours),
        })),
      },
    };
  },

  // ── STARTER — Ek tool'lar ──────────────────

  /** Ürün listesi */
  async getProducts(tenantId: string, search?: string) {
    const products = await prisma.product.findMany({
      where: {
        tenantId, deletedAt: null, isActive: true,
        ...(search && { OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search, mode: 'insensitive' as const } },
        ] }),
      },
      select: {
        code: true, name: true, salesPrice: true, purchasePrice: true,
        minStockLevel: true,
        category: { select: { name: true } },
        unit: { select: { code: true } },
      },
      orderBy: { name: 'asc' },
      take: 30,
    });
    return { data: products, count: products.length };
  },

  /** Cari hesap detayı (isimle arama) */
  async getContactDetail(tenantId: string, contactName: string) {
    const contacts = await prisma.contact.findMany({
      where: {
        tenantId, deletedAt: null,
        name: { contains: contactName, mode: 'insensitive' as const },
      },
      select: {
        name: true, code: true, type: true, email: true, phone: true,
        city: true, creditLimit: true, paymentTermDays: true,
        accountEntries: { orderBy: { date: 'desc' }, take: 1, select: { balance: true } },
      },
      take: 5,
    });
    return {
      data: contacts.map((c) => ({
        ...c,
        balance: c.accountEntries[0] ? Number(c.accountEntries[0].balance) : 0,
        accountEntries: undefined,
      })),
      count: contacts.length,
    };
  },

  /** Stok hareketleri */
  async getStockMovements(tenantId: string, productName?: string) {
    const movements = await prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...(productName && { product: { name: { contains: productName, mode: 'insensitive' as const } } }),
      },
      select: {
        type: true, quantity: true, unitCost: true, notes: true, createdAt: true,
        product: { select: { name: true, code: true } },
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { data: movements, count: movements.length };
  },

  // ── PROFESSIONAL — Ek tool'lar ─────────────

  /** Satış teklifleri */
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
  async getBankTransactions(tenantId: string) {
    const txns = await prisma.bankTransaction.findMany({
      where: { tenantId },
      select: {
        date: true, type: true, amount: true, description: true, reference: true,
        bankAccount: { select: { name: true, bankName: true } },
      },
      orderBy: { date: 'desc' },
      take: 30,
    });
    return { data: txns, count: txns.length };
  },

  /** E-Belgeler */
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
  async getLedgerAccounts(tenantId: string) {
    const accounts = await prisma.ledgerAccount.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { code: true, name: true, accountType: true },
      orderBy: { code: 'asc' },
      take: 50,
    });
    return { data: accounts, count: accounts.length };
  },

  /** Yevmiye fişleri */
  async getJournalEntries(tenantId: string, dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(dateFrom) : getMonthStartDate();
    const to = dateTo ? new Date(dateTo) : new Date();

    const entries = await prisma.journalEntry.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      select: {
        number: true, date: true, type: true, description: true, isPosted: true,
        lines: { select: { debit: true, credit: true } },
      },
      orderBy: { date: 'desc' },
      take: 20,
    });
    return {
      data: entries.map((e) => ({
        ...e,
        totalDebit: e.lines.reduce((s, l) => s + Number(l.debit), 0),
        totalCredit: e.lines.reduce((s, l) => s + Number(l.credit), 0),
        lines: undefined,
      })),
      count: entries.length,
    };
  },

  // ── ENTERPRISE — Ek tool'lar ───────────────

  /** Ürün ağaçları (BOM) */
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
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getCurrentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthStartDate(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function groupByDepartment(payrolls: Array<{ grossSalary: Prisma.Decimal | number; netSalary: Prisma.Decimal | number; employee: { department: string | null } }>) {
  const map: Record<string, { count: number; totalGross: number; totalNet: number }> = {};
  for (const p of payrolls) {
    const dept = p.employee.department ?? 'Belirtilmemiş';
    if (!map[dept]) map[dept] = { count: 0, totalGross: 0, totalNet: 0 };
    map[dept].count++;
    map[dept].totalGross += Number(p.grossSalary);
    map[dept].totalNet += Number(p.netSalary);
  }
  return Object.entries(map).map(([name, data]) => ({ name, ...data }));
}
