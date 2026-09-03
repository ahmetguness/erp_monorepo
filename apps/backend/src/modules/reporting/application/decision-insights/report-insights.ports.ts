import type { ReportInsightSnapshot } from './report-insights.types.js';

export interface ReportInsightsRepository {
  loadSnapshot(tenantId: string, period: { from: Date; to: Date; previousFrom: Date; previousTo: Date }): Promise<ReportInsightSnapshot>;
}
