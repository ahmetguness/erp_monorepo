export type ReportInsightCategory = 'REVENUE' | 'EXPENSE' | 'COLLECTION' | 'STOCK';
export type ReportInsightSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ReportInsightSource {
  entityType: 'INVOICE' | 'PRODUCT' | 'CONTACT';
  entityId: string;
  label: string;
  href: string;
}

export interface ReportInsightAction {
  label: string;
  href: string;
  expectedImpact: string;
}

export interface ReportDecisionInsight {
  id: string;
  category: ReportInsightCategory;
  severity: ReportInsightSeverity;
  title: string;
  explanation: string;
  metric: { current: number; previous: number | null; changePercent: number | null; unit: 'TRY' | 'COUNT' };
  rootCauses: string[];
  confidence: number;
  action: ReportInsightAction;
  sources: ReportInsightSource[];
}

export interface ReportInsightSnapshot {
  currentRevenue: number;
  previousRevenue: number;
  currentExpense: number;
  previousExpense: number;
  overdueTotal: number;
  overdueInvoices: Array<{ id: string; number: string; contactId: string; contactName: string; amount: number; dueDate: Date | null }>;
  lowStock: Array<{ productId: string; productCode: string; productName: string; quantity: number; minimum: number }>;
  decliningProducts: Array<{ productId: string; productCode: string; productName: string; currentRevenue: number; previousRevenue: number }>;
  expenseDrivers: Array<{ contactId: string; contactName: string; currentAmount: number; previousAmount: number }>;
}

export interface ReportDecisionWorkspace {
  generatedAt: string;
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  summary: { totalInsights: number; critical: number; potentialCashImpact: number };
  executiveSummary: string;
  insights: ReportDecisionInsight[];
}
