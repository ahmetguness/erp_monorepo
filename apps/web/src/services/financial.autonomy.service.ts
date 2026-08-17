import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const CashFlowDailySnapshotSchema = z.object({
  date: z.string(),
  expectedInflow: z.number(),
  expectedOutflow: z.number(),
  netFlow: z.number(),
  projectedBalance: z.number(),
  status: z.enum(['HEALTHY', 'WARNING', 'DEFICIT']),
});

export const CashFlowForecastResultSchema = z.object({
  generatedAt: z.string(),
  forecastDays: z.number(),
  initialBalance: z.number(),
  totalExpectedInflow: z.number(),
  totalExpectedOutflow: z.number(),
  projectedEndBalance: z.number(),
  deficitDaysCount: z.number(),
  dailySnapshots: z.array(CashFlowDailySnapshotSchema),
});

export const ContactPaymentVelocitySchema = z.object({
  contactId: z.string(),
  contactName: z.string(),
  totalInvoices: z.number(),
  avgPaymentDays: z.number(),
  avgDelayDays: z.number(),
  reliabilityScore: z.number(),
  riskCategory: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export const CollectionSettlementDraftSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  contactName: z.string(),
  totalAmount: z.number(),
  dueDate: z.string(),
  daysOverdue: z.number(),
  suggestedDiscountPercent: z.number(),
  discountAmount: z.number(),
  netPayableAmount: z.number(),
  validUntil: z.string(),
  paymentLinkUrl: z.string(),
  installmentOptions: z.array(
    z.object({
      installments: z.number(),
      monthlyAmount: z.number(),
      totalAmount: z.number(),
    }),
  ),
});

export const LiquidityRecommendationSchema = z.object({
  id: z.string(),
  type: z.enum(['EARLY_PAYMENT_DISCOUNT', 'VENDOR_EXTENSION', 'INTERNAL_TRANSFER']),
  title: z.string(),
  description: z.string(),
  impactAmount: z.number(),
  actionType: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export type CashFlowForecastResult = z.infer<typeof CashFlowForecastResultSchema>;
export type ContactPaymentVelocity = z.infer<typeof ContactPaymentVelocitySchema>;
export type CollectionSettlementDraft = z.infer<typeof CollectionSettlementDraftSchema>;
export type LiquidityRecommendation = z.infer<typeof LiquidityRecommendationSchema>;

export async function getCashFlowForecast(days = 30): Promise<CashFlowForecastResult> {
  const res = await apiClient.get('/api/financial-autonomy/cash-flow-forecast', { params: { days } });
  return res.data.data;
}

export async function getContactPaymentVelocity(contactId: string): Promise<ContactPaymentVelocity> {
  const res = await apiClient.get(`/api/financial-autonomy/contact-velocity/${encodeURIComponent(contactId)}`);
  return res.data.data;
}

export async function generateCollectionSettlement(invoiceId: string): Promise<CollectionSettlementDraft> {
  const res = await apiClient.post(`/api/financial-autonomy/collection-settlement/${encodeURIComponent(invoiceId)}`);
  return res.data.data;
}

export async function getLiquidityRecommendations(): Promise<LiquidityRecommendation[]> {
  const res = await apiClient.get('/api/financial-autonomy/recommendations');
  return res.data.data;
}

export async function executeFinancialAction(actionType: string, payload?: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post('/api/financial-autonomy/execute-action', { actionType, payload });
  return res.data.data;
}
