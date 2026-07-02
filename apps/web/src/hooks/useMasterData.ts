'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getUnits, createUnit, deleteUnit,
  getCategories, createCategory, updateCategory, deleteCategory,
  getTaxRates, createTaxRate, updateTaxRate,
  getCurrencies, createCurrency,
  type CreateUnitDTO,
  type CreateCategoryDTO, type UpdateCategoryDTO,
  type CreateTaxRateDTO, type UpdateTaxRateDTO,
  type CreateCurrencyDTO,
} from '@/services/master-data.service';

// ─────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────

export const MASTER_KEYS = {
  units: ['master', 'units'] as const,
  categories: ['master', 'categories'] as const,
  taxRates: ['master', 'tax-rates'] as const,
  currencies: ['master', 'currencies'] as const,
};

function invalidateMasterSetupQueries(qc: ReturnType<typeof useQueryClient>, queryKey: readonly unknown[]) {
  qc.invalidateQueries({ queryKey });
  qc.invalidateQueries({ queryKey: ['settings', 'setup-checklist'] });
}

// ─────────────────────────────────────────────
// Units
// ─────────────────────────────────────────────

export function useUnits() {
  return useQuery({ queryKey: MASTER_KEYS.units, queryFn: getUnits, staleTime: 5 * 60 * 1000 });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateUnitDTO) => createUnit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MASTER_KEYS.units });
      toast.success('Birim oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteUnit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MASTER_KEYS.units });
      toast.success('Birim silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────

export function useCategories() {
  return useQuery({ queryKey: MASTER_KEYS.categories, queryFn: getCategories, staleTime: 5 * 60 * 1000 });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateCategoryDTO) => createCategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MASTER_KEYS.categories });
      toast.success('Kategori oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCategoryDTO }) => updateCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MASTER_KEYS.categories });
      toast.success('Kategori güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MASTER_KEYS.categories });
      toast.success('Kategori silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─────────────────────────────────────────────
// Tax Rates
// ─────────────────────────────────────────────

export function useTaxRates() {
  return useQuery({ queryKey: MASTER_KEYS.taxRates, queryFn: getTaxRates, staleTime: 5 * 60 * 1000 });
}

export function useCreateTaxRate() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateTaxRateDTO) => createTaxRate(data),
    onSuccess: () => {
      invalidateMasterSetupQueries(qc, MASTER_KEYS.taxRates);
      toast.success('KDV oranı oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateTaxRate() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaxRateDTO }) => updateTaxRate(id, data),
    onSuccess: () => {
      invalidateMasterSetupQueries(qc, MASTER_KEYS.taxRates);
      toast.success('KDV oranı güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─────────────────────────────────────────────
// Currencies
// ─────────────────────────────────────────────

export function useCurrencies() {
  return useQuery({ queryKey: MASTER_KEYS.currencies, queryFn: getCurrencies, staleTime: 5 * 60 * 1000 });
}

export function useCreateCurrency() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateCurrencyDTO) => createCurrency(data),
    onSuccess: () => {
      invalidateMasterSetupQueries(qc, MASTER_KEYS.currencies);
      toast.success('Para birimi oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
