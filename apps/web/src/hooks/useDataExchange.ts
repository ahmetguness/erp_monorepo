'use client';

import { useMutation } from '@tanstack/react-query';
import { downloadTemplate, exportData, previewImport, type DataExchangeEntity } from '@/services/data-exchange.service';

export function useImportPreview() {
  return useMutation({
    mutationFn: ({ entity, csv }: { entity: DataExchangeEntity; csv: string }) => previewImport(entity, csv),
  });
}

export function useTemplateDownload() {
  return useMutation({
    mutationFn: (entity: DataExchangeEntity) => downloadTemplate(entity),
  });
}

export function useDataExport() {
  return useMutation({
    mutationFn: (entity: DataExchangeEntity) => exportData(entity),
  });
}
