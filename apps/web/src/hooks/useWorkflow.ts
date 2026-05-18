'use client';

import { useQuery } from '@tanstack/react-query';
import { getWorkflowTasks } from '@/services/task.service';

export function useWorkflowTasks() {
  return useQuery({
    queryKey: ['workflow-tasks'],
    queryFn: getWorkflowTasks,
    refetchInterval: 60_000,
  });
}
