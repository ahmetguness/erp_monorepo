'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getAiGovernanceLogs,
  getAiGovernanceInsights,
  getAiGovernancePolicy,
  recordAiActionAudit,
  updateAiGovernanceInsightsSettings,
  updateAiGovernancePolicy,
  type AiActionAuditPayload,
  type AiGovernanceCostSettings,
  type AiGovernanceLogParams,
  type AiGovernancePolicy,
} from '@/services/intelligence.service';

export function useAiGovernanceLogs(params: AiGovernanceLogParams) {
  return useQuery({
    queryKey: ['ai-governance', 'logs', params],
    queryFn: () => getAiGovernanceLogs(params),
  });
}

export function useAiGovernancePolicy() {
  return useQuery({
    queryKey: ['ai-governance', 'policy'],
    queryFn: getAiGovernancePolicy,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAiGovernanceInsights() {
  return useQuery({
    queryKey: ['ai-governance', 'insights'],
    queryFn: getAiGovernanceInsights,
    staleTime: 60 * 1000,
  });
}

export function useUpdateAiGovernancePolicy() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (policy: AiGovernancePolicy) => updateAiGovernancePolicy(policy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-governance'] });
      qc.invalidateQueries({ queryKey: ['settings', 'modules'] });
      toast.success('AI politikasi kaydedildi.');
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}

export function useUpdateAiGovernanceInsightsSettings() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (settings: AiGovernanceCostSettings) => updateAiGovernanceInsightsSettings(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-governance', 'insights'] });
      toast.success('AI maliyet limiti kaydedildi.');
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}

export function useRecordAiActionAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AiActionAuditPayload) => recordAiActionAudit(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-governance', 'logs'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}
