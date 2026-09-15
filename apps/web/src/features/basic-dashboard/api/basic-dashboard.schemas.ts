import { z } from "zod";

const trendPointSchema = z.object({ period: z.string(), amount: z.number() });
export const executiveDashboardSchema = z.object({
  sales: z.object({
    today: z.number(),
    currentMonth: z.number(),
    previousMonth: z.number(),
    trend: z.array(trendPointSchema),
  }),
  receivables: z.object({
    total: z.number(),
    overdue: z.number(),
    dueSoon: z.number(),
  }),
  cash: z.object({ bank: z.number(), cash: z.number(), total: z.number() }),
  inventory: z.object({ lowStockCount: z.number().int().nonnegative() }),
  salesOrders: z.object({
    openCount: z.number().int().nonnegative(),
    openAmount: z.number(),
  }),
  generatedAt: z.string(),
});
export const productionDashboardSchema = z.object({
  workOrders: z.object({
    openByStatus: z.record(z.string(), z.number()),
    overdue: z.number().int().nonnegative(),
  }),
  output: z.object({ planned: z.number(), produced: z.number() }),
  scrap: z.object({
    quantity: z.number(),
    producedQuantity: z.number(),
    rate: z.number(),
  }),
  workCenters: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      capacity: z.number(),
      allocated: z.number(),
      utilization: z.number(),
    }),
  ),
  generatedAt: z.string(),
});
export const procurementDashboardSchema = z.object({
  openOrders: z.object({
    count: z.number().int().nonnegative(),
    amount: z.number(),
  }),
  overdueDeliveries: z.number().int().nonnegative(),
  upcomingDeliveries: z.array(
    z.object({
      id: z.string(),
      number: z.string(),
      supplier: z.string(),
      dueDate: z.string(),
      amount: z.number(),
      status: z.string(),
    }),
  ),
  generatedAt: z.string(),
});

export type ExecutiveDashboard = z.infer<typeof executiveDashboardSchema>;
export type ProductionDashboard = z.infer<typeof productionDashboardSchema>;
export type ProcurementDashboard = z.infer<typeof procurementDashboardSchema>;
