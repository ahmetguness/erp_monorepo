'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getProducts, getProductById, createProduct, updateProduct, deleteProduct,
  downloadProductQuickImportTemplate, previewProductQuickImport, commitProductQuickImport,
  type ProductListParams, type CreateProductDTO, type UpdateProductDTO,
  type ProductQuickImportInput,
} from '@/services/product.service';

export const PRODUCT_KEYS = {
  all: ['products'] as const,
  list: (p: ProductListParams) => ['products', 'list', p] as const,
  detail: (id: string) => ['products', id] as const,
};

function invalidateProductAndStockQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: PRODUCT_KEYS.all });
  qc.invalidateQueries({ queryKey: ['stock'] });
}

export function useProducts(params: ProductListParams) {
  return useQuery({ queryKey: PRODUCT_KEYS.list(params), queryFn: () => getProducts(params) });
}

export function useProduct(id: string) {
  return useQuery({ queryKey: PRODUCT_KEYS.detail(id), queryFn: () => getProductById(id), enabled: !!id });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateProductDTO) => createProduct(data),
    onSuccess: () => { invalidateProductAndStockQueries(qc); toast.success('Ürün oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: UpdateProductDTO) => updateProduct(id, data),
    onSuccess: () => {
      invalidateProductAndStockQueries(qc);
      qc.invalidateQueries({ queryKey: PRODUCT_KEYS.detail(id) });
      toast.success('Ürün güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => { invalidateProductAndStockQueries(qc); toast.success('Ürün silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useProductQuickImportTemplate() {
  return useMutation({ mutationFn: downloadProductQuickImportTemplate });
}

export function useProductQuickImportPreview() {
  return useMutation({
    mutationFn: (input: ProductQuickImportInput) => previewProductQuickImport(input),
  });
}

export function useCommitProductQuickImport() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (input: ProductQuickImportInput) => commitProductQuickImport(input),
    onSuccess: (result) => {
      invalidateProductAndStockQueries(qc);
      toast.success(`${result.createdCount} urun ice aktarildi.`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
