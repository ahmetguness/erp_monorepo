export interface TrendPoint {
  period: string;
  amount: number;
}

export interface ExecutiveDashboard {
  sales: {
    today: number;
    currentMonth: number;
    previousMonth: number;
    trend: TrendPoint[];
  };
  receivables: { total: number; overdue: number; dueSoon: number };
  cash: { bank: number; cash: number; total: number };
  inventory: { lowStockCount: number };
  salesOrders: { openCount: number; openAmount: number };
  generatedAt: string;
}

export interface ProductionDashboard {
  workOrders: { openByStatus: Record<string, number>; overdue: number };
  output: { planned: number; produced: number };
  scrap: { quantity: number; producedQuantity: number; rate: number };
  workCenters: Array<{
    id: string;
    code: string;
    name: string;
    capacity: number;
    allocated: number;
    utilization: number;
  }>;
  generatedAt: string;
}

export interface ProcurementDashboard {
  openOrders: { count: number; amount: number };
  overdueDeliveries: number;
  upcomingDeliveries: Array<{
    id: string;
    number: string;
    supplier: string;
    dueDate: string;
    amount: number;
    status: string;
  }>;
  generatedAt: string;
}
