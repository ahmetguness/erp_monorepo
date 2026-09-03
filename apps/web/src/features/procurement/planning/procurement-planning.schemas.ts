import { z } from 'zod';

export const ReplenishmentPolicySchema = z.object({ lookbackDays: z.number(), horizonDays: z.number(), targetServiceLevel: z.number(), autoCreateDrafts: z.boolean(), maximumDraftValue: z.number() });
const ScenarioSchema = z.object({ kind: z.enum(['LEAN', 'BALANCED', 'RESILIENT']), quantity: z.number(), estimatedCost: z.number(), projectedServiceLevel: z.number(), projectedDaysOfSupply: z.number() });
const RecommendationSchema = z.object({ productId: z.string(), productCode: z.string(), productName: z.string(), supplierId: z.string().nullable(), supplierName: z.string().nullable(), available: z.number(), incoming: z.number(), openSales: z.number(), dailyDemand: z.number(), seasonalFactor: z.number(), forecastAccuracy: z.number(), leadTimeDays: z.number(), safetyStock: z.number(), daysToStockout: z.number().nullable(), urgency: z.enum(['HEALTHY', 'PLAN', 'CRITICAL']), recommendedScenario: z.enum(['LEAN', 'BALANCED', 'RESILIENT']), scenarios: z.array(ScenarioSchema), explanation: z.array(z.string()) });
export const ReplenishmentWorkspaceSchema = z.object({ generatedAt: z.string(), policy: ReplenishmentPolicySchema, summary: z.object({ productsAnalyzed: z.number(), actionRequired: z.number(), critical: z.number(), recommendedInvestment: z.number() }), recommendations: z.array(RecommendationSchema) });
export const ReplenishmentRunResultSchema = z.object({ createdDrafts: z.array(z.object({ purchaseOrderId: z.string(), purchaseOrderNumber: z.string(), productId: z.string(), amount: z.number() })), skipped: z.array(z.object({ productId: z.string(), reason: z.string() })) });
export type ReplenishmentPolicy = z.infer<typeof ReplenishmentPolicySchema>;
export type ReplenishmentWorkspace = z.infer<typeof ReplenishmentWorkspaceSchema>;
