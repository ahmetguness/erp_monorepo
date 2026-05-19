'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  deleteAttachment,
  getAttachmentEntityOptions,
  getAttachments,
  getDocumentCenter,
  renameAttachment,
  updateAttachmentMetadata,
  uploadAttachment,
  type AttachmentEntityType,
  type AttachmentMetadataInput,
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

export function useAttachmentEntityOptions(entityType: AttachmentEntityType, search?: string) {
  return useQuery({
    queryKey: ['attachments', 'entity-options', entityType, search],
    queryFn: () => getAttachmentEntityOptions(entityType, search),
    enabled: Boolean(entityType),
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ entityType, entityId, file, metadata }: { entityType: string; entityId: string; file: File; metadata?: AttachmentMetadataInput }) =>
      uploadAttachment(entityType, entityId, file, metadata),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['attachments', vars.entityType, vars.entityId] });
      qc.invalidateQueries({ queryKey: ['attachments', 'library'] });
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

export function useUpdateAttachmentMetadata() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; fileName?: string } & AttachmentMetadataInput) => updateAttachmentMetadata(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments'] });
      toast.success('Dosya bilgileri güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
