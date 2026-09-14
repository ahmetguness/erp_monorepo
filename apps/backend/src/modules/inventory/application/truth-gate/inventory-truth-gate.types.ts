export type InventoryTruthGateStatus = "PASS" | "FAIL" | "NOT_TESTED";

export type InventoryTruthGateKey =
  | "opening_stock"
  | "purchase_receipt"
  | "sales_delivery"
  | "reservation"
  | "reservation_release"
  | "production_consumption"
  | "production_output"
  | "return"
  | "adjustment"
  | "transfer"
  | "lot_serial"
  | "cost_valuation";

export interface InventoryTruthGateCheck {
  key: InventoryTruthGateKey;
  label: string;
  status: InventoryTruthGateStatus;
  evidenceCount: number;
  violationCount: number;
  detail: string;
}

export interface InventoryTruthGateReport {
  decision: "GO" | "NO_GO";
  checks: InventoryTruthGateCheck[];
  summary: { passed: number; failed: number; notTested: number; total: number };
  generatedAt: string;
}
