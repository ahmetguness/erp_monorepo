'use client';

import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { confirmUnifiedCommand, searchUnified } from '@/services/search.service';

export function useGlobalSearch(query: string, recentHrefs: string[], enabled = true) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['unified-search', normalized, recentHrefs],
    queryFn: () => searchUnified(normalized, recentHrefs),
    enabled,
    staleTime: 30_000,
  });
}

export function useConfirmUnifiedCommand() {
  return useMutation({ mutationFn: confirmUnifiedCommand });
}
