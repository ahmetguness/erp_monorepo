'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getContactBalance,
  getExpenseSummary,
  getPinnedKpiPreviews,
  getRevenueSummary,
  getStockSummary,
} from '@/services/reporting.service';

export interface ReportDateRange {
  dateFrom: string;
  dateTo: string;
}

interface QueryOptions {
  enabled?: boolean;
}

export const REPORTING_QUERY_KEYS = {
  revenueSummary: (range: ReportDateRange) => ['reports', 'revenue-summary', range] as const,
  expenseSummary: (range: ReportDateRange) => ['reports', 'expense-summary', range] as const,
  stockSummary: ['reports', 'stock-summary'] as const,
  contactBalance: ['reports', 'contact-balance'] as const,
  pinnedKpiPreviews: ['reports', 'pinned-kpi'] as const,
};

export function useRevenueSummary(range: ReportDateRange, options?: QueryOptions) {
  return useQuery({
    queryKey: REPORTING_QUERY_KEYS.revenueSummary(range),
    queryFn: () => getRevenueSummary(range.dateFrom, range.dateTo),
    enabled: options?.enabled ?? true,
  });
}

export function useExpenseSummary(range: ReportDateRange, options?: QueryOptions) {
  return useQuery({
    queryKey: REPORTING_QUERY_KEYS.expenseSummary(range),
    queryFn: () => getExpenseSummary(range.dateFrom, range.dateTo),
    enabled: options?.enabled ?? true,
  });
}

export function useStockSummary(options?: QueryOptions) {
  return useQuery({
    queryKey: REPORTING_QUERY_KEYS.stockSummary,
    queryFn: getStockSummary,
    enabled: options?.enabled ?? true,
  });
}

export function useContactBalance(options?: QueryOptions) {
  return useQuery({
    queryKey: REPORTING_QUERY_KEYS.contactBalance,
    queryFn: getContactBalance,
    enabled: options?.enabled ?? true,
  });
}

export function usePinnedKpiPreviews(options?: QueryOptions) {
  return useQuery({
    queryKey: REPORTING_QUERY_KEYS.pinnedKpiPreviews,
    queryFn: getPinnedKpiPreviews,
    enabled: options?.enabled ?? true,
  });
}
