'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDomainEventFailures,
  replayDomainEvent,
  type DomainEventParams,
} from '@/services/domain-event.service';

export function useDomainEventFailures(params: Omit<DomainEventParams, 'status'>) {
  return useQuery({
    queryKey: ['domain-events', 'failures', params],
    queryFn: () => getDomainEventFailures(params),
  });
}

export function useReplayDomainEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: replayDomainEvent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['domain-events'] });
    },
  });
}
