import { prisma } from '../../lib/prisma';
import { InvoiceStatus, InvoiceType, PaymentStatus, Prisma, PurchaseRequestStatus } from '@prisma/client';
import { generateDocumentNumber } from '../../utils/generate-number.js';
import { getCurrentPeriod, getMonthStartDate, groupByDepartment } from './shared.js';
import type { LowStockPurchaseAdjustment, LowStockPurchaseRequestOptions } from './shared.js';

export const financeChatDataService = {
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
} as const;
