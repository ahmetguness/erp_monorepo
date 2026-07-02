import { ContactType, InvoiceType, PrismaClient } from '@prisma/client';

export interface CustomerTrackingMoneyDocument {
  id: string;
  number: string;
  date: string;
  status: string;
  totalGross: number;
}

export interface CustomerTrackingInvoice extends CustomerTrackingMoneyDocument {
  dueDate: string | null;
}

export interface CustomerTrackingReminder {
  id: string;
  dueDate: string;
  amount: number;
  status: string;
  invoiceNumber: string | null;
}

export interface CustomerTrackingRow {
  contact: {
    id: string;
    name: string;
    type: ContactType;
    email: string | null;
    phone: string | null;
  };
  openBalance: number;
  lastQuote: CustomerTrackingMoneyDocument | null;
  lastInvoice: CustomerTrackingInvoice | null;
  upcomingCollection: CustomerTrackingReminder | null;
}

export interface CustomerTrackingSummary {
  customerCount: number;
  contactsWithOpenBalance: number;
  openBalanceTotal: number;
  upcomingCollectionTotal: number;
}

export interface CustomerTrackingDashboard {
  summary: CustomerTrackingSummary;
  rows: CustomerTrackingRow[];
}

interface BalanceSnapshot {
  openBalance: number;
}

interface BalanceSummary {
  contactsWithOpenBalance: number;
  openBalanceTotal: number;
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

export class CustomerTrackingService {
  constructor(private readonly prisma: PrismaClient) {}

  async dashboard(tenantId: string, limit = DEFAULT_LIMIT): Promise<CustomerTrackingDashboard> {
    const take = clampLimit(limit);
    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        type: { in: [ContactType.CUSTOMER, ContactType.BOTH] },
      },
      select: { id: true, name: true, type: true, email: true, phone: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: take * 3,
    });

    const contactIds = contacts.map((contact) => contact.id);
    const [customerCount, balanceMap, balanceSummary, lastQuoteMap, lastInvoiceMap, reminderMap, upcomingCollectionTotal] = await Promise.all([
      this.countCustomers(tenantId),
      this.balanceByContact(tenantId, contactIds),
      this.balanceSummary(tenantId),
      this.lastQuotesByContact(tenantId, contactIds),
      this.lastInvoicesByContact(tenantId, contactIds),
      this.upcomingRemindersByContact(tenantId, contactIds),
      this.upcomingCollectionTotal(tenantId),
    ]);

    const rows = contacts
      .map<CustomerTrackingRow>((contact) => ({
        contact: {
          id: contact.id,
          name: contact.name,
          type: contact.type,
          email: contact.email,
          phone: contact.phone,
        },
        openBalance: balanceMap.get(contact.id)?.openBalance ?? 0,
        lastQuote: lastQuoteMap.get(contact.id) ?? null,
        lastInvoice: lastInvoiceMap.get(contact.id) ?? null,
        upcomingCollection: reminderMap.get(contact.id) ?? null,
      }))
      .sort(compareRows)
      .slice(0, take);

    return {
      summary: {
        customerCount,
        contactsWithOpenBalance: balanceSummary.contactsWithOpenBalance,
        openBalanceTotal: balanceSummary.openBalanceTotal,
        upcomingCollectionTotal,
      },
      rows,
    };
  }

  private countCustomers(tenantId: string): Promise<number> {
    return this.prisma.contact.count({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        type: { in: [ContactType.CUSTOMER, ContactType.BOTH] },
      },
    });
  }

  private async balanceByContact(tenantId: string, contactIds: string[]): Promise<Map<string, BalanceSnapshot>> {
    if (contactIds.length === 0) return new Map();

    const balances = await this.prisma.accountEntry.groupBy({
      by: ['contactId'],
      where: { tenantId, contactId: { in: contactIds } },
      _sum: { debit: true, credit: true },
    });

    return new Map(
      balances.map((balance) => [
        balance.contactId,
        { openBalance: Number(balance._sum.debit ?? 0) - Number(balance._sum.credit ?? 0) },
      ]),
    );
  }

  private async balanceSummary(tenantId: string): Promise<BalanceSummary> {
    const balances = await this.prisma.accountEntry.groupBy({
      by: ['contactId'],
      where: {
        tenantId,
        contact: {
          deletedAt: null,
          isActive: true,
          type: { in: [ContactType.CUSTOMER, ContactType.BOTH] },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const openBalances = balances
      .map((balance) => Number(balance._sum.debit ?? 0) - Number(balance._sum.credit ?? 0))
      .filter((openBalance) => openBalance !== 0);

    return {
      contactsWithOpenBalance: openBalances.length,
      openBalanceTotal: openBalances.reduce((sum, openBalance) => sum + openBalance, 0),
    };
  }

  private async lastQuotesByContact(tenantId: string, contactIds: string[]): Promise<Map<string, CustomerTrackingMoneyDocument>> {
    if (contactIds.length === 0) return new Map();

    const quotes = await this.prisma.salesQuote.findMany({
      where: { tenantId, contactId: { in: contactIds }, deletedAt: null },
      select: { id: true, contactId: true, number: true, date: true, status: true, totalGross: true },
      distinct: ['contactId'],
      orderBy: { date: 'desc' },
      take: contactIds.length,
    });

    const map = new Map<string, CustomerTrackingMoneyDocument>();
    for (const quote of quotes) {
      if (map.has(quote.contactId)) continue;
      map.set(quote.contactId, {
        id: quote.id,
        number: quote.number,
        date: toIsoDate(quote.date),
        status: quote.status,
        totalGross: Number(quote.totalGross),
      });
    }
    return map;
  }

  private async lastInvoicesByContact(tenantId: string, contactIds: string[]): Promise<Map<string, CustomerTrackingInvoice>> {
    if (contactIds.length === 0) return new Map();

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        contactId: { in: contactIds },
        deletedAt: null,
        type: InvoiceType.SALES,
      },
      select: { id: true, contactId: true, number: true, date: true, dueDate: true, status: true, totalGross: true },
      distinct: ['contactId'],
      orderBy: { date: 'desc' },
      take: contactIds.length,
    });

    const map = new Map<string, CustomerTrackingInvoice>();
    for (const invoice of invoices) {
      if (map.has(invoice.contactId)) continue;
      map.set(invoice.contactId, {
        id: invoice.id,
        number: invoice.number,
        date: toIsoDate(invoice.date),
        dueDate: invoice.dueDate ? toIsoDate(invoice.dueDate) : null,
        status: invoice.status,
        totalGross: Number(invoice.totalGross),
      });
    }
    return map;
  }

  private async upcomingRemindersByContact(tenantId: string, contactIds: string[]): Promise<Map<string, CustomerTrackingReminder>> {
    if (contactIds.length === 0) return new Map();

    const reminders = await this.prisma.collectionReminder.findMany({
      where: {
        tenantId,
        contactId: { in: contactIds },
        status: 'PENDING',
        dueDate: { gte: startOfToday() },
      },
      select: {
        id: true,
        contactId: true,
        dueDate: true,
        amount: true,
        status: true,
        invoice: { select: { number: true } },
      },
      distinct: ['contactId'],
      orderBy: { dueDate: 'asc' },
      take: contactIds.length,
    });

    const map = new Map<string, CustomerTrackingReminder>();
    for (const reminder of reminders) {
      if (map.has(reminder.contactId)) continue;
      map.set(reminder.contactId, {
        id: reminder.id,
        dueDate: toIsoDate(reminder.dueDate),
        amount: Number(reminder.amount),
        status: reminder.status,
        invoiceNumber: reminder.invoice?.number ?? null,
      });
    }
    return map;
  }

  private async upcomingCollectionTotal(tenantId: string): Promise<number> {
    const result = await this.prisma.collectionReminder.aggregate({
      where: {
        tenantId,
        status: 'PENDING',
        dueDate: { gte: startOfToday() },
        contact: {
          deletedAt: null,
          isActive: true,
          type: { in: [ContactType.CUSTOMER, ContactType.BOTH] },
        },
      },
      _sum: { amount: true },
    });

    return Number(result._sum.amount ?? 0);
  }
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function compareRows(left: CustomerTrackingRow, right: CustomerTrackingRow): number {
  const leftReminder = left.upcomingCollection ? 1 : 0;
  const rightReminder = right.upcomingCollection ? 1 : 0;
  if (leftReminder !== rightReminder) return rightReminder - leftReminder;

  const balanceDelta = Math.abs(right.openBalance) - Math.abs(left.openBalance);
  if (balanceDelta !== 0) return balanceDelta;

  const leftDate = left.lastInvoice?.date ?? left.lastQuote?.date ?? '';
  const rightDate = right.lastInvoice?.date ?? right.lastQuote?.date ?? '';
  return rightDate.localeCompare(leftDate);
}
