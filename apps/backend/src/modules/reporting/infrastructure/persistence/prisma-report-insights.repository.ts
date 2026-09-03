import { InvoiceStatus, InvoiceType, PaymentStatus, type PrismaClient } from '@prisma/client';
import type { ReportInsightSnapshot, ReportInsightsRepository } from '../../application/decision-insights/index.js';

interface AggregateRow { current: number; previous: number }

export class PrismaReportInsightsRepository implements ReportInsightsRepository {
  constructor(private readonly db: PrismaClient) {}
  async loadSnapshot(tenantId: string, period: { from: Date; to: Date; previousFrom: Date; previousTo: Date }): Promise<ReportInsightSnapshot> {
    const commonInvoice = { tenantId, deletedAt: null, status: { not: InvoiceStatus.CANCELLED } } as const;
    const [currentInvoices, previousInvoices, overdueInvoices, products] = await this.db.$transaction([
      this.db.invoice.findMany({ where: { ...commonInvoice, date: { gte: period.from, lte: period.to } }, select: { type: true, totalGross: true, contactId: true, contact: { select: { name: true } }, lines: { where: { productId: { not: null } }, select: { productId: true, lineTotal: true, product: { select: { code: true, name: true } } } } } }),
      this.db.invoice.findMany({ where: { ...commonInvoice, date: { gte: period.previousFrom, lte: period.previousTo } }, select: { type: true, totalGross: true, contactId: true, contact: { select: { name: true } }, lines: { where: { productId: { not: null } }, select: { productId: true, lineTotal: true, product: { select: { code: true, name: true } } } } } }),
      this.db.invoice.findMany({ where: { tenantId, deletedAt: null, type: InvoiceType.SALES, status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] }, dueDate: { lt: new Date() } }, select: { id: true, number: true, contactId: true, contact: { select: { name: true } }, totalGross: true, dueDate: true, payments: { select: { amount: true, payment: { select: { status: true, deletedAt: true } } } } }, orderBy: { dueDate: 'asc' }, take: 100 }),
      this.db.product.findMany({ where: { tenantId, deletedAt: null, isActive: true, minStockLevel: { gt: 0 } }, select: { id: true, code: true, name: true, minStockLevel: true, stockLevels: { select: { quantity: true } } }, take: 500 }),
    ]);
    const revenueByProduct = new Map<string, AggregateRow & { code: string; name: string }>();
    const expenseByContact = new Map<string, AggregateRow & { name: string }>();
    const collect = (invoices: typeof currentInvoices, side: keyof AggregateRow): void => {
      for (const invoice of invoices) {
        if (invoice.type === InvoiceType.SALES) for (const line of invoice.lines) {
          if (!line.productId || !line.product) continue;
          const row = revenueByProduct.get(line.productId) ?? { code: line.product.code, name: line.product.name, current: 0, previous: 0 };
          row[side] += Number(line.lineTotal); revenueByProduct.set(line.productId, row);
        }
        if (invoice.type === InvoiceType.PURCHASE) {
          const row = expenseByContact.get(invoice.contactId) ?? { name: invoice.contact.name, current: 0, previous: 0 };
          row[side] += Number(invoice.totalGross); expenseByContact.set(invoice.contactId, row);
        }
      }
    };
    collect(currentInvoices, 'current'); collect(previousInvoices, 'previous');
    const currentRevenue = currentInvoices.filter((item) => item.type === InvoiceType.SALES).reduce((sum, item) => sum + Number(item.totalGross), 0);
    const previousRevenue = previousInvoices.filter((item) => item.type === InvoiceType.SALES).reduce((sum, item) => sum + Number(item.totalGross), 0);
    const currentExpense = currentInvoices.filter((item) => item.type === InvoiceType.PURCHASE).reduce((sum, item) => sum + Number(item.totalGross), 0);
    const previousExpense = previousInvoices.filter((item) => item.type === InvoiceType.PURCHASE).reduce((sum, item) => sum + Number(item.totalGross), 0);
    const overdue = overdueInvoices.map((invoice) => ({ id: invoice.id, number: invoice.number, contactId: invoice.contactId, contactName: invoice.contact.name, amount: Math.max(0, Number(invoice.totalGross) - invoice.payments.filter((allocation) => allocation.payment.status === PaymentStatus.COMPLETED && allocation.payment.deletedAt === null).reduce((sum, allocation) => sum + Number(allocation.amount), 0)), dueDate: invoice.dueDate })).filter((invoice) => invoice.amount > 0);
    return {
      currentRevenue, previousRevenue, currentExpense, previousExpense, overdueTotal: overdue.reduce((sum, invoice) => sum + invoice.amount, 0), overdueInvoices: overdue,
      lowStock: products.map((product) => ({ productId: product.id, productCode: product.code, productName: product.name, quantity: product.stockLevels.reduce((sum, level) => sum + Number(level.quantity), 0), minimum: Number(product.minStockLevel) })).filter((product) => product.quantity < product.minimum).sort((left, right) => (left.quantity / left.minimum) - (right.quantity / right.minimum)),
      decliningProducts: [...revenueByProduct.entries()].map(([productId, row]) => ({ productId, productCode: row.code, productName: row.name, currentRevenue: row.current, previousRevenue: row.previous })).filter((item) => item.currentRevenue < item.previousRevenue).sort((left, right) => (right.previousRevenue - right.currentRevenue) - (left.previousRevenue - left.currentRevenue)),
      expenseDrivers: [...expenseByContact.entries()].map(([contactId, row]) => ({ contactId, contactName: row.name, currentAmount: row.current, previousAmount: row.previous })).filter((item) => item.currentAmount > item.previousAmount).sort((left, right) => (right.currentAmount - right.previousAmount) - (left.currentAmount - left.previousAmount)),
    };
  }
}
