'use client';

import { useQuery } from '@tanstack/react-query';
import { searchGlobal } from '@/services/search.service';

export function useGlobalSearch(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['global-search', normalized],
    queryFn: () => searchGlobal(normalized),
    enabled: normalized.length >= 2,
    staleTime: 30_000,
  });
}
