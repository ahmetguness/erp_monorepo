'use client';
import { useQuery } from '@tanstack/react-query';
import { getStockValuations, type ListParams } from '@/services/stock-valuation.service';

export function useStockValuations(params: ListParams) {
  return useQuery({ queryKey: ['stock-valuations', params], queryFn: () => getStockValuations(params) });
}
