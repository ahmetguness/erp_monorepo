'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  executeBulkOperation,
  previewBulkOperation,
  type BulkOperationPayload,
  type BulkOperationResult,
  type BulkOperationTarget,
} from '@/services/bulk-operation.service';

interface BulkOperationMutationInput {
  target: BulkOperationTarget;
  payload: BulkOperationPayload;
}

export function usePreviewBulkOperation() {
  const { toast } = useUIStore();
  return useMutation<BulkOperationResult, unknown, BulkOperationMutationInput>({
    mutationFn: ({ target, payload }) => previewBulkOperation(target, payload),
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}

export function useExecuteBulkOperation() {
  const { toast } = useUIStore();
  const qc = useQueryClient();
  return useMutation<BulkOperationResult, unknown, BulkOperationMutationInput>({
    mutationFn: ({ target, payload }) => executeBulkOperation(target, payload),
    onSuccess: (result) => {
      if (result.target === 'contacts') {
        qc.invalidateQueries({ queryKey: ['contacts'] });
      } else if (result.target === 'products') {
        qc.invalidateQueries({ queryKey: ['products'] });
      } else {
        qc.invalidateQueries({ queryKey: ['invoices'] });
      }
      toast.success(`${result.changed} kayıt güncellendi. Geri alma kaydı oluşturuldu.`);
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}
