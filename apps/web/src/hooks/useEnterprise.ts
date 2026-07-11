'use client';

import { useQuery } from '@tanstack/react-query';
import * as enterprise from '@/services/enterprise.service';

export function useHoldingCompany() {
  return useQuery({
    queryKey: ['enterprise', 'holding'],
    queryFn: enterprise.getHoldingCompany,
  });
}
