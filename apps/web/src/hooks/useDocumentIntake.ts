'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { approveDocumentDraft, extractDocumentDraft, type ReadyDocumentDraft } from '@/services/document-intake.service';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';

export function useExtractDocumentDraft() {
  const { toast } = useUIStore();
  return useMutation({ mutationFn: extractDocumentDraft, onError: (error: unknown) => toast.error(getErrorMessage(error)) });
}

export function useApproveDocumentDraft() {
  const queryClient = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (draft: ReadyDocumentDraft) => approveDocumentDraft(draft),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['attachments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(result.message);
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}
