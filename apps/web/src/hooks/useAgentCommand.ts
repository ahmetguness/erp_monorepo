'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  adoptSuggestion,
  executePlan,
  getWorkflowSuggestions,
  parsePrompt,
} from '@/services/agent.command.service';

export function useWorkflowSuggestions() {
  return useQuery({
    queryKey: ['agent-command', 'suggestions'],
    queryFn: () => getWorkflowSuggestions(),
  });
}

export function useParsePrompt() {
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (prompt: string) => parsePrompt(prompt),
    onSuccess: (data) => {
      toast.success(`Komut istemi analiz edildi. ${data.steps.length} deterministik adım planlandı.`);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useExecutePlan() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (planId: string) => executePlan(planId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['agent-command'] });
      toast.success(data.message);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useAdoptSuggestion() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (suggestionId: string) => adoptSuggestion(suggestionId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['agent-command'] });
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success(data.message);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
