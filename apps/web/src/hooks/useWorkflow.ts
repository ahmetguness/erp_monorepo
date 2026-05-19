'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { createTask, getWorkflowTasks, type CreateTaskDTO } from '@/services/task.service';

export function useWorkflowTasks() {
  return useQuery({
    queryKey: ['workflow-tasks'],
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
      qc.invalidateQueries({ queryKey: ['workflow-tasks'] });
      qc.invalidateQueries({ queryKey: ['d', 'tasks'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      toast.success('Görev oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
