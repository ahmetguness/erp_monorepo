'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  runAutomationRule,
  runActiveAutomationRules,
  getAutomationRuleTemplates,
  type CreateAutomationRuleDTO,
} from '@/services/intelligence.service';

export const AUTOMATION_KEYS = {
  all: ['automation-rules'] as const,
  templates: ['automation-rules', 'templates'] as const,
};

export function useAutomationRules() {
  return useQuery({
    queryKey: AUTOMATION_KEYS.all,
    queryFn: getAutomationRules,
  });
}

export function useAutomationRuleTemplates() {
  return useQuery({
    queryKey: AUTOMATION_KEYS.templates,
    queryFn: getAutomationRuleTemplates,
  });
}

export function useCreateAutomationRule() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateAutomationRuleDTO) => createAutomationRule(data),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.all });
      toast.success(`"${rule.name}" otomasyon kuralı oluşturuldu.`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateAutomationRule() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAutomationRuleDTO> & { isActive?: boolean } }) =>
      updateAutomationRule(id, data),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.all });
      toast.success(`"${rule.name}" otomasyon kuralı güncellendi.`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteAutomationRule() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteAutomationRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.all });
      toast.success('Otomasyon kuralı silindi.');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useRunAutomationRule() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => runAutomationRule(id),
    onSuccess: (result) => {
      if (result.executed) {
        toast.success(`Kural çalıştırıldı. Eşleşen ${result.matchesCount} kayıt için işlem yapıldı.`);
      } else {
        toast.info('Kural pasif olduğu için çalıştırılamadı.');
      }
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useRunActiveAutomationRules() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => runActiveAutomationRules(),
    onSuccess: (result) => {
      toast.success(`Tüm aktif kurallar tetiklendi. Toplam ${result.executedRulesCount} kural başarıyla yürütüldü.`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}
