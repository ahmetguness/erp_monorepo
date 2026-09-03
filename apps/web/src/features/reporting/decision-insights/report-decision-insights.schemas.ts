import { z } from 'zod';

const SourceSchema = z.object({ entityType: z.enum(['INVOICE', 'PRODUCT', 'CONTACT']), entityId: z.string(), label: z.string(), href: z.string() });
const InsightSchema = z.object({ id: z.string(), category: z.enum(['REVENUE', 'EXPENSE', 'COLLECTION', 'STOCK']), severity: z.enum(['INFO', 'WARNING', 'CRITICAL']), title: z.string(), explanation: z.string(), metric: z.object({ current: z.number(), previous: z.number().nullable(), changePercent: z.number().nullable(), unit: z.enum(['TRY', 'COUNT']) }), rootCauses: z.array(z.string()), confidence: z.number(), action: z.object({ label: z.string(), href: z.string(), expectedImpact: z.string() }), sources: z.array(SourceSchema) });
export const ReportDecisionWorkspaceSchema = z.object({ generatedAt: z.string(), period: z.object({ from: z.string(), to: z.string(), previousFrom: z.string(), previousTo: z.string() }), summary: z.object({ totalInsights: z.number(), critical: z.number(), potentialCashImpact: z.number() }), executiveSummary: z.string(), insights: z.array(InsightSchema) });
export type ReportDecisionWorkspace = z.infer<typeof ReportDecisionWorkspaceSchema>;
