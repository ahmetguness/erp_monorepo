import type { ModuleKey, PlanName } from "./plans.js";

export type BillingProvider = "MANUAL" | "STRIPE" | "IYZICO";
export type SubscriptionState = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
export type BillingInvoiceState = "OPEN" | "PAID" | "FAILED" | "VOID";
export interface SubscriptionInvoice {
  id: string;
  providerInvoiceId: string | null;
  amount: string;
  currency: string;
  status: BillingInvoiceState;
  dueAt: string;
  paidAt: string | null;
  failureReason: string | null;
}
export interface SubscriptionDiscount {
  code: string;
  percent: number;
  expiresAt: string;
}
export interface SubscriptionSnapshot {
  tenantId: string;
  provider: BillingProvider;
  providerCustomerId: string | null;
  state: SubscriptionState;
  plan: PlanName;
  monthlyAmount: string;
  currency: string;
  mrr: string;
  arr: string;
  dunningAttempt: number;
  nextRetryAt: string | null;
  customUnitPrice: string | null;
  customPricingExpiresAt: string | null;
  discount: SubscriptionDiscount | null;
  invoices: SubscriptionInvoice[];
  expectedModules: ModuleKey[];
  actualModules: ModuleKey[];
  missingModules: ModuleKey[];
  extraModules: ModuleKey[];
}
export interface RevenueOverview {
  mrr: string;
  arr: string;
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  failedInvoices: number;
  trialConversions: number;
}
export interface PlanChangeQuote {
  fromPlan: PlanName;
  toPlan: PlanName;
  activeUsers: number;
  currentMonthly: string;
  nextMonthly: string;
  proratedAmount: string;
  currency: string;
  effectiveAt: string;
  moduleChanges: { added: ModuleKey[]; removed: ModuleKey[] };
}
export interface CustomPriceRequest {
  id: string;
  state: "PENDING" | "APPLIED" | "REJECTED";
  monthlyAmount: string;
  unitPrice: string | null;
  expiresAt: string;
  reason: string;
  requestedById: string;
  decidedById: string | null;
  createdAt: string;
}
