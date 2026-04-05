'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getProductBatches, createProductBatch, updateProductBatch, type ListParams, type CreateProductBatchDTO, type UpdateProductBatchDTO } from '@/services/product-batch.service';

const KEYS = { list: (p: ListParams) => ['product-batches', p] as const };

export function useProductBatches(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getProductBatches(params) });
}
export function useCreateProductBatch() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateProductBatchDTO) => createProductBatch(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product-batches'] }); toast.success('Parti oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useUpdateProductBatch() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductBatchDTO }) => updateProductBatch(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product-batches'] }); toast.success('Parti güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
