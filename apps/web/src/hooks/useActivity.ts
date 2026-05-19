'use client';

import { useQuery } from '@tanstack/react-query';
import { getActivity, type ActivityParams } from '@/services/activity.service';

export function useActivity(params: ActivityParams) {
  return useQuery({
    queryKey: ['activity', params],
    queryFn: () => getActivity(params),
    enabled: Boolean(params.entityType && params.entityId),
  });
}
