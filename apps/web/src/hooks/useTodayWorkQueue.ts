'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateTaskStatus } from '@/services/task.service';
import { getTodayWorkQueue, type TodayWorkQueue } from '@/services/today-work-queue.service';
import { useUIStore } from '@/store/ui.store';

export const TODAY_WORK_QUEUE_KEY = ['today-work-queue'] as const;
export function useTodayWorkQueue(enabled = true) {
  return useQuery({ queryKey: TODAY_WORK_QUEUE_KEY, queryFn: getTodayWorkQueue, enabled, staleTime: 30_000 });
}
export function useCompleteTodayWorkItem() {
  const queryClient = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (sourceId: string) => updateTaskStatus(sourceId, 'DONE'),
    onMutate: async (sourceId) => {
      await queryClient.cancelQueries({ queryKey: TODAY_WORK_QUEUE_KEY });
      const previous = queryClient.getQueryData<TodayWorkQueue>(TODAY_WORK_QUEUE_KEY);
      queryClient.setQueryData<TodayWorkQueue>(TODAY_WORK_QUEUE_KEY, (current) => {
        if (!current) return current;
        const removed = current.items.find((item) => item.sourceId === sourceId && item.kind === 'TASK');
        if (!removed) return current;
        return { ...current, items: current.items.filter((item) => item.id !== removed.id), summary: {
          ...current.summary, total: Math.max(0, current.summary.total - 1),
          critical: Math.max(0, current.summary.critical - (removed.risk === 'CRITICAL' ? 1 : 0)),
          breached: Math.max(0, current.summary.breached - (removed.sla.state === 'BREACHED' ? 1 : 0)),
          monetaryImpact: Math.max(0, current.summary.monetaryImpact - (removed.monetaryImpact ?? 0)),
        } };
      });
      return { previous };
    },
    onError: (_error, _sourceId, context) => {
      if (context?.previous) queryClient.setQueryData(TODAY_WORK_QUEUE_KEY, context.previous);
      toast.error('Görev tamamlanamadı. Kuyruk geri yüklendi.');
    },
    onSuccess: () => toast.success('Görev tamamlandı ve Bugün kuyruğundan kaldırıldı.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TODAY_WORK_QUEUE_KEY }),
  });
}
