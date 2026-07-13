'use client';

import { useQuery } from '@tanstack/react-query';
import { getPlanUsageSummary } from '@/services/plan-usage.service';

interface UsePlanUsageOptions {
  enabled?: boolean;
}

export const PLAN_USAGE_QUERY_KEYS = {
  summary: ['plan-usage', 'summary'] as const,
};

export function usePlanUsage(options?: UsePlanUsageOptions) {
  return useQuery({
    queryKey: PLAN_USAGE_QUERY_KEYS.summary,
    queryFn: getPlanUsageSummary,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}
