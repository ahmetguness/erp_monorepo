'use client';

import { useQuery } from '@tanstack/react-query';
import { getEntityTimeline, getOperationsHealth } from '@/services/operations.service';

export function useOperationsHealth() {
  return useQuery({
    queryKey: ['operations', 'health'],
    queryFn: getOperationsHealth,
    refetchInterval: 30 * 1000, // Refetch every 30 seconds for live monitoring
  });
}

export function useEntityTimeline(entityType: string, entityId: string, enabled = true) {
  return useQuery({
    queryKey: ['operations', 'timeline', entityType, entityId],
    queryFn: () => getEntityTimeline(entityType, entityId),
    enabled: enabled && Boolean(entityType) && Boolean(entityId),
  });
}
