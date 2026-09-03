'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getReplenishmentWorkspace, runReplenishmentPlanning, updateReplenishmentPolicy } from './procurement-planning.api';

const key = ['procurement', 'replenishment-planning'] as const;
export function useProcurementPlanning() { return useQuery({ queryKey: key, queryFn: getReplenishmentWorkspace }); }
export function useUpdateProcurementPolicy() { const client = useQueryClient(); const { toast } = useUIStore(); return useMutation({ mutationFn: updateReplenishmentPolicy, onSuccess: () => { void client.invalidateQueries({ queryKey: key }); toast.success('İkmal politikası güncellendi.'); }, onError: (error: unknown) => toast.error(getErrorMessage(error)) }); }
export function useRunProcurementPlanning() { const client = useQueryClient(); const { toast } = useUIStore(); return useMutation({ mutationFn: runReplenishmentPlanning, onSuccess: (result) => { void client.invalidateQueries({ queryKey: key }); void client.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(`${result.createdDrafts.length} satın alma taslağı oluşturuldu.`); }, onError: (error: unknown) => toast.error(getErrorMessage(error)) }); }
