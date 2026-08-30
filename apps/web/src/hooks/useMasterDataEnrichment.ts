'use client';

import { useMutation } from '@tanstack/react-query';
import { previewMasterData, type MasterDataEnrichmentInput } from '@/services/master-data-enrichment.service';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';

export function useMasterDataEnrichment() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (input: MasterDataEnrichmentInput) => previewMasterData(input),
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}
