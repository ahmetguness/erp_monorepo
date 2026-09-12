export const ADMIN_DASHBOARD_RANGES = [7, 30, 90] as const;
export type AdminDashboardRangeDays = (typeof ADMIN_DASHBOARD_RANGES)[number];
export type DecisionMetricTone =
  | "POSITIVE"
  | "NEUTRAL"
  | "WARNING"
  | "CRITICAL";
export type DecisionMetricFormat = "NUMBER" | "PERCENT" | "CURRENCY";
export interface AdminDecisionMetric {
  key:
    | "ACTIVE_USAGE"
    | "TRIAL_CONVERSION"
    | "CHURN_RISK"
    | "MRR"
    | "ARR"
    | "ERROR_BUDGET"
    | "OPEN_INCIDENTS"
    | "PENDING_APPROVALS";
  label: string;
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  format: DecisionMetricFormat;
  currency: string | null;
  tone: DecisionMetricTone;
  href: string;
  detail: string;
}
export interface AdminDecisionDashboard {
  rangeDays: AdminDashboardRangeDays;
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  metrics: AdminDecisionMetric[];
  generatedAt: string;
  dataNotes: string[];
}
