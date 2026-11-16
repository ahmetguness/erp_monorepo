'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDomainEventFailures,
  getDomainEvents,
  replayDomainEvent,
  type DomainEventParams,
} from '@/services/domain-event.service';

export function useDomainEvents(params: DomainEventParams, failuresOnly: boolean) {
  return useQuery({
    queryKey: ['domain-events', failuresOnly ? 'failures' : 'all', params],
    queryFn: () => failuresOnly ? getDomainEventFailures(params) : getDomainEvents(params),
    refetchInterval: 10_000,
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
