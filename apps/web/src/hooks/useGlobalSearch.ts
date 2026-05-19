'use client';

import { useQuery } from '@tanstack/react-query';
import { searchGlobal } from '@/services/search.service';

export function useGlobalSearch(query: string, enabled = true) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['global-search', normalized],
    queryFn: () => searchGlobal(normalized),
    enabled,
    staleTime: 30_000,
  });
}
