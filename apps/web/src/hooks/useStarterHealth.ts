'use client';

import { useQuery } from '@tanstack/react-query';
import { getStarterHealthScore } from '@/services/starter-health.service';

interface QueryOptions {
  enabled?: boolean;
}

export const STARTER_HEALTH_QUERY_KEYS = {
  status: ['starter-health', 'status'] as const,
};

export function useStarterHealthScore(options?: QueryOptions) {
  return useQuery({
    queryKey: STARTER_HEALTH_QUERY_KEYS.status,
    queryFn: getStarterHealthScore,
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}
