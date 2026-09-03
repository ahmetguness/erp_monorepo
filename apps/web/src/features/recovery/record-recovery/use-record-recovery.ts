'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getRecoveryItems, undoOperation, type RecoveryRecordContext } from './record-recovery.api';

const key = (context: RecoveryRecordContext) => ['operation-recovery', context.entityType, context.entityId] as const;
export function useRecordRecovery(context: RecoveryRecordContext) { return useQuery({ queryKey: key(context), queryFn: () => getRecoveryItems(context), enabled: Boolean(context.entityId) }); }
export function useUndoOperation(context: RecoveryRecordContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (auditLogId: string) => undoOperation(context, auditLogId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key(context) }),
        client.invalidateQueries({ queryKey: ['activity'] }),
        client.invalidateQueries({ queryKey: [context.entityType.toLowerCase()] }),
        client.invalidateQueries({ queryKey: ['contacts'] }),
      ]);
      toast.success('Değişiklik güvenle geri alındı.');
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}
