'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getAttachments, uploadAttachment, deleteAttachment } from '@/services/attachment.service';

export function useAttachments(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => getAttachments(entityType, entityId),
    enabled: !!entityType && !!entityId,
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ entityType, entityId, file }: { entityType: string; entityId: string; file: File }) =>
      uploadAttachment(entityType, entityId, file),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['attachments', vars.entityType, vars.entityId] });
      toast.success('Dosya yüklendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments'] });
      toast.success('Dosya silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
