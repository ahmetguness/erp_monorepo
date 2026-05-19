'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getAttachments,
  getDocumentCenter,
  uploadAttachment,
  deleteAttachment,
  renameAttachment,
  type DocumentCenterParams,
} from '@/services/attachment.service';

export function useAttachments(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => getAttachments(entityType, entityId),
    enabled: !!entityType && !!entityId,
  });
}

export function useDocumentCenter(params: DocumentCenterParams) {
  return useQuery({
    queryKey: ['attachments', 'library', params],
    queryFn: () => getDocumentCenter(params),
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

export function useRenameAttachment() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, fileName }: { id: string; fileName: string }) => renameAttachment(id, fileName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments'] });
      toast.success('Dosya adı güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
