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
  getAutomationExecutions,
  getAutomationRuleTemplates,
  getSchedulerJobs,
  getSchedulerRuns,
  runSchedulerJob,
  type CreateAutomationRuleDTO,
  type SchedulerJobKey,
} from '@/services/intelligence.service';

export const AUTOMATION_KEYS = {
  all: ['automation-rules'] as const,
  templates: ['automation-rules', 'templates'] as const,
  executions: ['automation-rules', 'executions'] as const,
  schedulerJobs: ['automation-rules', 'scheduler', 'jobs'] as const,
  schedulerRuns: ['automation-rules', 'scheduler', 'runs'] as const,
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

export function useAutomationExecutions() {
  return useQuery({
    queryKey: AUTOMATION_KEYS.executions,
    queryFn: getAutomationExecutions,
  });
}

export function useSchedulerJobs() {
  return useQuery({
    queryKey: AUTOMATION_KEYS.schedulerJobs,
    queryFn: getSchedulerJobs,
  });
}

export function useSchedulerRuns() {
  return useQuery({
    queryKey: AUTOMATION_KEYS.schedulerRuns,
    queryFn: getSchedulerRuns,
  });
}

export function useCreateAutomationRule() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateAutomationRuleDTO) => createAutomationRule(data),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.all });
      toast.success(`"${rule.name}" otomasyon kurali olusturuldu.`);
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
      toast.success(`"${rule.name}" otomasyon kurali guncellendi.`);
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
      toast.success('Otomasyon kurali silindi.');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useRunAutomationRule() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => runAutomationRule(id),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.executions });
      const actionCount = result.tasksCreated + result.notificationsCreated;
      if (actionCount > 0) {
        toast.success(`Kural calistirildi. ${result.matched} eslesmeden ${actionCount} aksiyon olusturuldu.`);
      } else {
        toast.info(`Kural calisti; eslesen ${result.matched} kayit icin yeni aksiyon olusmadi.`);
      }
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useRunActiveAutomationRules() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => runActiveAutomationRules(),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.executions });
      const actionCount = result.tasksCreated + result.notificationsCreated;
      toast.success(`Aktif kurallar tetiklendi. ${result.matched} eslesmeden ${actionCount} aksiyon olusturuldu.`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useRunSchedulerJob() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (jobKey: SchedulerJobKey | 'all') => runSchedulerJob(jobKey),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.schedulerRuns });
      void qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.executions });
      if (result.failed > 0) {
        toast.error(`Scheduler tamamlandi; ${result.failed} job hatali, ${result.succeeded} job basarili.`);
        return;
      }
      toast.success(`Scheduler tamamlandi. ${result.succeeded} basarili, ${result.skipped} atlandi.`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}
