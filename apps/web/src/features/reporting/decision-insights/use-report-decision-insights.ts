'use client';
import { useQuery } from '@tanstack/react-query';
import { getReportDecisionInsights } from './report-decision-insights.api';

export function useReportDecisionInsights(dateFrom: string, dateTo: string) {
  return useQuery({ queryKey: ['reports', 'decision-insights', dateFrom, dateTo], queryFn: () => getReportDecisionInsights(dateFrom, dateTo), enabled: Boolean(dateFrom && dateTo) });
}
