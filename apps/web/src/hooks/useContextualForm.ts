'use client';

import { useQuery } from '@tanstack/react-query';
import { getContextualFormPolicy, type ContextualFormKind } from '@/services/contextual-form.service';

export function useContextualFormPolicy(formKind: ContextualFormKind, context?: string) {
  return useQuery({
    queryKey: ['contextual-form-policy', formKind, context],
    queryFn: () => getContextualFormPolicy(formKind, context),
    staleTime: 10 * 60 * 1000,
  });
}
