'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getWarehouses, getWarehouseById, createWarehouse, updateWarehouse, transferStock,
  getLocations, createLocation, deleteLocation,
  getStockLevels, getStockReorderSuggestions, getStockMovements, createManualMovement,
  getStockCounts, getStockCountById, createStockCount, finalizeStockCount,
  type StockLevelParams, type StockMovementParams, type CreateManualMovementDTO,
  type CreateStockCountDTO, type CreateWarehouseDTO, type CreateLocationDTO, type TransferStockDTO,
} from '@/services/stock.service';

export const STOCK_KEYS = {
  warehouses: ['warehouses'] as const,
  warehouse: (id: string) => ['warehouses', id] as const,
  locations: (wId: string) => ['warehouses', wId, 'locations'] as const,
  levels: (p: StockLevelParams) => ['stock', 'levels', p] as const,
  reorderSuggestions: ['stock', 'reorder-suggestions'] as const,
  movements: (p: StockMovementParams) => ['stock', 'movements', p] as const,
  counts: ['stock', 'counts'] as const,
  count: (id: string) => ['stock', 'counts', id] as const,
};

// ── Warehouses ──────────────────────────────

export function useWarehouses() {
  return useQuery({ queryKey: STOCK_KEYS.warehouses, queryFn: getWarehouses, staleTime: 5 * 60 * 1000 });
}

export function useWarehouse(id: string) {
  return useQuery({ queryKey: STOCK_KEYS.warehouse(id), queryFn: () => getWarehouseById(id), enabled: !!id });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateWarehouseDTO) => createWarehouse(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: STOCK_KEYS.warehouses }); toast.success('Depo oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateWarehouse(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: Partial<CreateWarehouseDTO> & { isActive?: boolean }) => updateWarehouse(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_KEYS.warehouses });
      qc.invalidateQueries({ queryKey: STOCK_KEYS.warehouse(id) });
      toast.success('Depo güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useTransferStock() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: TransferStockDTO) => transferStock(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', 'levels'] });
      toast.success('Transfer tamamlandı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useLocations(warehouseId: string) {
  return useQuery({
    queryKey: STOCK_KEYS.locations(warehouseId),
    queryFn: () => getLocations(warehouseId),
    enabled: !!warehouseId,
  });
}

export function useCreateLocation(warehouseId: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateLocationDTO) => createLocation(warehouseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_KEYS.locations(warehouseId) });
      toast.success('Lokasyon oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteLocation(warehouseId: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (locationId: string) => deleteLocation(warehouseId, locationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_KEYS.locations(warehouseId) });
      toast.success('Lokasyon silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Stock Levels ─────────────────────────────

export function useStockLevels(params: StockLevelParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: STOCK_KEYS.levels(params),
    queryFn: () => getStockLevels(params),
    enabled: options?.enabled ?? true,
  });
}

export function useStockReorderSuggestions() {
  return useQuery({
    queryKey: STOCK_KEYS.reorderSuggestions,
    queryFn: getStockReorderSuggestions,
  });
}

// ── Stock Movements ──────────────────────────

export function useStockMovements(params: StockMovementParams) {
  return useQuery({ queryKey: STOCK_KEYS.movements(params), queryFn: () => getStockMovements(params) });
}

export function useCreateManualMovement() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateManualMovementDTO) => createManualMovement(data),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      const warning = response.meta?.warnings[0];
      if (warning) {
        toast.warning(warning);
        return;
      }
      toast.success('Stok hareketi oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Stock Counts ─────────────────────────────

export function useStockCounts() {
  return useQuery({ queryKey: STOCK_KEYS.counts, queryFn: getStockCounts });
}

export function useStockCount(id: string) {
  return useQuery({ queryKey: STOCK_KEYS.count(id), queryFn: () => getStockCountById(id), enabled: !!id });
}

export function useCreateStockCount() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateStockCountDTO) => createStockCount(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: STOCK_KEYS.counts }); toast.success('Sayım oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useFinalizeStockCount(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (applyAdjustments: boolean) => finalizeStockCount(id, applyAdjustments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_KEYS.counts });
      qc.invalidateQueries({ queryKey: STOCK_KEYS.count(id) });
      qc.invalidateQueries({ queryKey: ['stock', 'levels'] });
      toast.success('Sayım tamamlandı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
