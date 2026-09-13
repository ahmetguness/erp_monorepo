'use client';

import { useQuery } from '@tanstack/react-query';
import { getPilotReadiness } from './pilot-readiness.service';

export function usePilotReadiness() {
  return useQuery({
    queryKey: ['pilot-readiness'],
    queryFn: getPilotReadiness,
    refetchInterval: 60_000,
  });
}
