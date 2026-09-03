import { apiClient } from '@/lib/api-client';
import { ReportDecisionWorkspaceSchema, type ReportDecisionWorkspace } from './report-decision-insights.schemas';

export async function getReportDecisionInsights(dateFrom: string, dateTo: string): Promise<ReportDecisionWorkspace> {
  const response = await apiClient.get('/api/reports/decision-insights', { params: { dateFrom, dateTo } });
  return ReportDecisionWorkspaceSchema.parse(response.data.data);
}
