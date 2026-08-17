'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  assignServiceTechnician,
  reserveServiceParts,
  completeServiceAndGenerateInvoice,
} from '@/services/service.automation.service';

export function useAssignServiceTechnician() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ id, technicianId }: { id: string; technicianId: string }) =>
      assignServiceTechnician(id, technicianId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service'] });
      toast.success('Teknisyen başarıyla atandı ve servis işleme alındı.');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useReserveServiceParts() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ id, warehouseId }: { id: string; warehouseId: string }) =>
      reserveServiceParts(id, warehouseId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['service'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(`${data.reservedItemCount} adet servis yedek parçası stoptan rezerve edildi.`);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useCompleteServiceAndGenerateInvoice() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ id, warehouseId }: { id: string; warehouseId?: string }) =>
      completeServiceAndGenerateInvoice(id, warehouseId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['service'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['e-documents'] });
      toast.success(
        `Servis tamamlandı! Otomatik Fatura (${data.invoiceNumber}) ve E-Belge taslağı üretildi.`,
      );
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
