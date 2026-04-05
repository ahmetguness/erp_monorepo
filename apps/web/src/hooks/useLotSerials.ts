'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getLotSerials, createLotSerial, assignLotToMovement, type ListParams, type CreateLotSerialDTO } from '@/services/lot-serial.service';

const KEYS = { list: (p: ListParams) => ['lot-serials', p] as const };

export function useLotSerials(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getLotSerials(params) });
}
export function useCreateLotSerial() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateLotSerialDTO) => createLotSerial(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lot-serials'] }); toast.success('Lot/Seri No oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useAssignLotToMovement() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, usedRefType, usedRefId }: { id: string; usedRefType: string; usedRefId: string }) => assignLotToMovement(id, usedRefType, usedRefId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lot-serials'] }); toast.success('Lot/Seri No atandı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
