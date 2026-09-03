export type ReplenishmentScenarioKind = "LEAN" | "BALANCED" | "RESILIENT";

export interface ReplenishmentPolicy {
  lookbackDays: number;
  horizonDays: number;
  targetServiceLevel: number;
  autoCreateDrafts: boolean;
  maximumDraftValue: number;
}

export interface ReplenishmentSourceRow {
  productId: string;
  productCode: string;
  productName: string;
  purchasePrice: number;
  minimumStock: number;
  onHand: number;
  reserved: number;
  incoming: number;
  openSales: number;
  recentDemand: number;
  previousDemand: number;
  demandSamples: number[];
  supplierId: string | null;
  supplierName: string | null;
  supplierUnitPrice: number | null;
  supplierLeadTimeDays: number | null;
  supplierReliability: number | null;
  minimumOrderQuantity: number;
  packageSize: number;
}

export interface ReplenishmentScenario {
  kind: ReplenishmentScenarioKind;
  quantity: number;
  estimatedCost: number;
  projectedServiceLevel: number;
  projectedDaysOfSupply: number;
}

export interface ReplenishmentRecommendation {
  productId: string;
  productCode: string;
  productName: string;
  supplierId: string | null;
  supplierName: string | null;
  available: number;
  incoming: number;
  openSales: number;
  dailyDemand: number;
  seasonalFactor: number;
  forecastAccuracy: number;
  leadTimeDays: number;
  safetyStock: number;
  daysToStockout: number | null;
  urgency: "HEALTHY" | "PLAN" | "CRITICAL";
  recommendedScenario: ReplenishmentScenarioKind;
  scenarios: ReplenishmentScenario[];
  explanation: string[];
}

export interface ReplenishmentWorkspace {
  generatedAt: string;
  policy: ReplenishmentPolicy;
  summary: {
    productsAnalyzed: number;
    actionRequired: number;
    critical: number;
    recommendedInvestment: number;
  };
  recommendations: ReplenishmentRecommendation[];
}

export interface ReplenishmentRunResult {
  createdDrafts: Array<{
    purchaseOrderId: string;
    purchaseOrderNumber: string;
    productId: string;
    amount: number;
  }>;
  skipped: Array<{ productId: string; reason: string }>;
}
