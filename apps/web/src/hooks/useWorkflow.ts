'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { createTask, getWorkflowTasks, type CreateTaskDTO } from '@/services/task.service';
import { QUERY_INVALIDATION_KEYS } from '@/lib/query-invalidation';

export function useWorkflowTasks() {
  return useQuery({
    queryKey: QUERY_INVALIDATION_KEYS.workflowTasks,
    queryFn: getWorkflowTasks,
    refetchInterval: 60_000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateTaskDTO) => createTask(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_INVALIDATION_KEYS.workflowTasks });
      qc.invalidateQueries({ queryKey: QUERY_INVALIDATION_KEYS.dashboardTasks });
      qc.invalidateQueries({ queryKey: ['activity'] });
      toast.success('Görev oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
