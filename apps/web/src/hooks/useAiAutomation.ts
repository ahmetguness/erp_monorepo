'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  detectAiAnomalies,
  executeAiSuggestion,
  extractOrderFromEmail,
  matchPaymentDescription,
  processInvoiceOcr,
  processNlErpQuery,
} from '@/services/ai.automation.service';

export function useProcessInvoiceOcr() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (text: string) => processInvoiceOcr(text),
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useExtractOrderFromEmail() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ subject, body }: { subject: string; body: string }) =>
      extractOrderFromEmail(subject, body),
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useMatchPaymentDescription() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ description, amount }: { description: string; amount: number }) =>
      matchPaymentDescription(description, amount),
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useAiAnomalies() {
  return useQuery({
    queryKey: ['ai', 'anomalies'],
    queryFn: detectAiAnomalies,
    refetchInterval: 60 * 1000,
  });
}

export function useNlErpQuery() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (prompt: string) => processNlErpQuery(prompt),
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useExecuteAiSuggestion() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ useCase, draftData }: { useCase: string; draftData: Record<string, unknown> }) =>
      executeAiSuggestion(useCase, draftData),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['ai'] });
      toast.success(data.message);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
