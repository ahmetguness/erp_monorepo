import { InvoiceType, type PrismaClient } from "@prisma/client";
import type {
  ExecutiveDashboard,
  ProcurementDashboard,
  ProductionDashboard,
  TrendPoint,
} from "../application/basic-dashboard.types.js";

const OPEN_WORK_ORDER_STATUSES = ["PLANNED", "IN_PROGRESS", "PAUSED"] as const;
const OPEN_PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "SENT",
  "PARTIALLY_RECEIVED",
] as const;
const OPEN_SALES_ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "PARTIALLY_DELIVERED",
] as const;
const round = (value: number): number => Math.round(value * 100) / 100;
const money = (value: unknown, rate: unknown = 1): number =>
  Number(value ?? 0) * Number(rate ?? 1);
const startOfDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const startOfMonth = (date: Date, offset = 0): Date =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);
const monthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const startOfUtcDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
const addUtcDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

export class BasicDashboardService {
  constructor(private readonly db: PrismaClient) {}

  async executive(
    tenantId: string,
    now = new Date(),
  ): Promise<ExecutiveDashboard> {
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const dueSoonEnd = addDays(today, 7);
    const trendStart = startOfMonth(now, -5);
    const currentMonth = startOfMonth(now);
    const nextMonth = startOfMonth(now, 1);
    const previousMonth = startOfMonth(now, -1);
    const [
      salesInvoices,
      receivableInvoices,
      bankAccounts,
      cashPayments,
      currencies,
      storedRates,
      stockLevels,
      salesOrders,
    ] = await Promise.all([
      this.db.invoice.findMany({
        where: {
          tenantId,
          type: InvoiceType.SALES,
          deletedAt: null,
          status: { not: "CANCELLED" },
          date: { gte: trendStart, lt: tomorrow },
        },
        select: {
          date: true,
          totalGross: true,
          exchangeRate: true,
        },
      }),
      this.db.invoice.findMany({
        where: {
          tenantId,
          type: InvoiceType.SALES,
          deletedAt: null,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        select: {
          dueDate: true,
          totalGross: true,
          exchangeRate: true,
          payments: { select: { amount: true } },
        },
      }),
      this.db.bankAccount.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: {
          currencyCode: true,
          transactions: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: { balanceAfter: true },
          },
        },
      }),
      this.db.payment.findMany({
        where: {
          tenantId,
          cashAccountId: { not: null },
          deletedAt: null,
          status: "COMPLETED",
        },
        select: {
          amount: true,
          direction: true,
          cashAccount: { select: { currencyCode: true } },
        },
      }),
      this.db.currency.findMany({
        where: { tenantId },
        select: {
          code: true,
          isBase: true,
          defaultRate: true,
        },
      }),
      this.db.currencyRate.findMany({
        where: { tenantId, date: { lte: today } },
        orderBy: { date: "desc" },
        select: { currencyCode: true, rate: true },
      }),
      this.db.stockLevel.findMany({
        where: { tenantId },
        select: {
          productId: true,
          warehouseId: true,
          quantity: true,
          product: { select: { minStockLevel: true } },
        },
      }),
      this.db.salesOrder.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...OPEN_SALES_ORDER_STATUSES] },
        },
        select: { totalGross: true, exchangeRate: true },
      }),
    ]);
    const invoiceBalance = (
      invoice: (typeof receivableInvoices)[number],
    ): number =>
      Math.max(
        0,
        money(invoice.totalGross, invoice.exchangeRate) -
          invoice.payments.reduce(
            (sum, item) => sum + money(item.amount, invoice.exchangeRate),
            0,
          ),
      );
    const trends = new Map<string, number>();
    for (let offset = -5; offset <= 0; offset += 1)
      trends.set(monthKey(startOfMonth(now, offset)), 0);
    for (const invoice of salesInvoices) {
      const period = monthKey(invoice.date);
      if (trends.has(period))
        trends.set(
          period,
          (trends.get(period) ?? 0) +
            money(invoice.totalGross, invoice.exchangeRate),
        );
    }
    const trend: TrendPoint[] = [...trends].map(([period, amount]) => ({
      period,
      amount: round(amount),
    }));
    const stockTotals = new Map<
      string,
      { quantity: number; minimum: number }
    >();
    for (const level of stockLevels) {
      const levelKey = `${level.productId}:${level.warehouseId}`;
      const current = stockTotals.get(levelKey) ?? {
        quantity: 0,
        minimum: Number(level.product.minStockLevel ?? 0),
      };
      current.quantity += Number(level.quantity);
      stockTotals.set(levelKey, current);
    }
    const latestStoredRates = new Map<string, number>();
    for (const storedRate of storedRates) {
      if (!latestStoredRates.has(storedRate.currencyCode)) {
        latestStoredRates.set(storedRate.currencyCode, Number(storedRate.rate));
      }
    }
    const currencyRates = new Map(
      currencies.map((currency) => [
        currency.code,
        currency.isBase
          ? 1
          : (latestStoredRates.get(currency.code) ??
            Number(currency.defaultRate)),
      ]),
    );
    const rateFor = (currencyCode: string): number =>
      currencyRates.get(currencyCode) ?? (currencyCode === "TRY" ? 1 : 0);
    const bank = bankAccounts.reduce(
      (sum, account) =>
        sum +
        Number(account.transactions[0]?.balanceAfter ?? 0) *
          rateFor(account.currencyCode),
      0,
    );
    const cash = cashPayments.reduce(
      (sum, payment) =>
        sum +
        (payment.direction === "RECEIVE" ? 1 : -1) *
          Number(payment.amount) *
          rateFor(payment.cashAccount?.currencyCode ?? "TRY"),
      0,
    );
    const totalReceivable = receivableInvoices.reduce(
      (sum, invoice) => sum + invoiceBalance(invoice),
      0,
    );
    return {
      sales: {
        today: round(
          salesInvoices
            .filter((row) => row.date >= today && row.date < tomorrow)
            .reduce(
              (sum, row) => sum + money(row.totalGross, row.exchangeRate),
              0,
            ),
        ),
        currentMonth: round(
          salesInvoices
            .filter((row) => row.date >= currentMonth && row.date < nextMonth)
            .reduce(
              (sum, row) => sum + money(row.totalGross, row.exchangeRate),
              0,
            ),
        ),
        previousMonth: round(
          salesInvoices
            .filter(
              (row) => row.date >= previousMonth && row.date < currentMonth,
            )
            .reduce(
              (sum, row) => sum + money(row.totalGross, row.exchangeRate),
              0,
            ),
        ),
        trend,
      },
      receivables: {
        total: round(totalReceivable),
        overdue: round(
          receivableInvoices
            .filter((row) => row.dueDate && row.dueDate < today)
            .reduce((sum, row) => sum + invoiceBalance(row), 0),
        ),
        dueSoon: round(
          receivableInvoices
            .filter(
              (row) =>
                row.dueDate && row.dueDate >= today && row.dueDate < dueSoonEnd,
            )
            .reduce((sum, row) => sum + invoiceBalance(row), 0),
        ),
      },
      cash: { bank: round(bank), cash: round(cash), total: round(bank + cash) },
      inventory: {
        lowStockCount: [...stockTotals.values()].filter(
          (row) => row.minimum > 0 && row.quantity < row.minimum,
        ).length,
      },
      salesOrders: {
        openCount: salesOrders.length,
        openAmount: round(
          salesOrders.reduce(
            (sum, row) => sum + money(row.totalGross, row.exchangeRate),
            0,
          ),
        ),
      },
      generatedAt: now.toISOString(),
    };
  }

  async production(
    tenantId: string,
    now = new Date(),
  ): Promise<ProductionDashboard> {
    const today = startOfUtcDay(now);
    const thirtyDaysAgo = addUtcDays(today, -30);
    const horizonEnd = addUtcDays(today, 7);
    const [orders, recentOrders, workCenters] = await Promise.all([
      this.db.workOrder.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...OPEN_WORK_ORDER_STATUSES] },
        },
        select: {
          status: true,
          endDate: true,
          plannedQty: true,
          producedQty: true,
        },
      }),
      this.db.workOrder.findMany({
        where: { tenantId, deletedAt: null, updatedAt: { gte: thirtyDaysAgo } },
        select: { producedQty: true, scrapQty: true },
      }),
      this.db.workCenter.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          capacity: true,
          capacities: {
            where: { date: { gte: today, lt: horizonEnd } },
            select: { capacity: true, allocated: true },
          },
        },
      }),
    ]);
    const openByStatus: Record<string, number> = {
      PLANNED: 0,
      IN_PROGRESS: 0,
      PAUSED: 0,
    };
    for (const order of orders)
      openByStatus[order.status] = (openByStatus[order.status] ?? 0) + 1;
    const producedQuantity = recentOrders.reduce(
      (sum, row) => sum + Number(row.producedQty),
      0,
    );
    const scrapQuantity = recentOrders.reduce(
      (sum, row) => sum + Number(row.scrapQty ?? 0),
      0,
    );
    return {
      workOrders: {
        openByStatus,
        overdue: orders.filter((row) => row.endDate && row.endDate < today)
          .length,
      },
      output: {
        planned: round(
          orders.reduce((sum, row) => sum + Number(row.plannedQty), 0),
        ),
        produced: round(
          orders.reduce((sum, row) => sum + Number(row.producedQty), 0),
        ),
      },
      scrap: {
        quantity: round(scrapQuantity),
        producedQuantity: round(producedQuantity),
        rate: round(
          (scrapQuantity / Math.max(producedQuantity + scrapQuantity, 1)) * 100,
        ),
      },
      workCenters: workCenters
        .map((center) => {
          const capacity =
            center.capacities.reduce(
              (sum, row) => sum + Number(row.capacity),
              0,
            ) || Number(center.capacity ?? 0) * 7;
          const allocated = center.capacities.reduce(
            (sum, row) => sum + Number(row.allocated),
            0,
          );
          return {
            id: center.id,
            code: center.code,
            name: center.name,
            capacity: round(capacity),
            allocated: round(allocated),
            utilization: round((allocated / Math.max(capacity, 1)) * 100),
          };
        })
        .sort((left, right) => right.utilization - left.utilization),
      generatedAt: now.toISOString(),
    };
  }

  async procurement(
    tenantId: string,
    now = new Date(),
  ): Promise<ProcurementDashboard> {
    const today = startOfUtcDay(now);
    const upcomingEnd = addUtcDays(today, 14);
    const orders = await this.db.purchaseOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: [...OPEN_PURCHASE_ORDER_STATUSES] },
      },
      select: {
        id: true,
        number: true,
        dueDate: true,
        totalGross: true,
        exchangeRate: true,
        status: true,
        contact: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    return {
      openOrders: {
        count: orders.length,
        amount: round(
          orders.reduce(
            (sum, row) => sum + money(row.totalGross, row.exchangeRate),
            0,
          ),
        ),
      },
      overdueDeliveries: orders.filter(
        (row) => row.dueDate && row.dueDate < today,
      ).length,
      upcomingDeliveries: orders
        .filter(
          (row) =>
            row.dueDate && row.dueDate >= today && row.dueDate < upcomingEnd,
        )
        .map((row) => ({
          id: row.id,
          number: row.number,
          supplier: row.contact.name,
          dueDate: row.dueDate?.toISOString() ?? "",
          amount: round(money(row.totalGross, row.exchangeRate)),
          status: row.status,
        })),
      generatedAt: now.toISOString(),
    };
  }
}
