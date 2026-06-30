import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCollectionReminders,
  createCollectionReminder,
  updateCollectionReminderStatus,
  deleteCollectionReminder,
  type CreateCollectionReminderDTO,
} from '@/services/collection-reminder.service';

export function useCollectionReminders() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['collection-reminders'],
    queryFn: getCollectionReminders,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCollectionReminderDTO) => createCollectionReminder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-reminders'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'PENDING' | 'SENT' | 'FAILED' }) =>
      updateCollectionReminderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-reminders'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCollectionReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-reminders'] });
    },
  });

  return {
    reminders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createReminder: createMutation,
    updateReminderStatus: updateStatusMutation,
    deleteReminder: deleteMutation,
  };
}
