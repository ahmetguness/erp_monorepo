'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getEDocumentExceptions, retryEDocument } from '@/services/edocument.automation.service';

export function useEDocumentExceptions() {
  return useQuery({
    queryKey: ['e-documents', 'exceptions'],
    queryFn: getEDocumentExceptions,
    refetchInterval: 30 * 1000,
  });
}

export function useRetryEDocument() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (id: string) => retryEDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['e-documents'] });
      toast.success('E-Belge entegratöre yeniden gönderildi.');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
