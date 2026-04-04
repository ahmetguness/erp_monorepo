'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getProducts, getProductById, createProduct, updateProduct, deleteProduct,
  type ProductListParams, type CreateProductDTO, type UpdateProductDTO,
} from '@/services/product.service';

export const PRODUCT_KEYS = {
  all: ['products'] as const,
  list: (p: ProductListParams) => ['products', 'list', p] as const,
  detail: (id: string) => ['products', id] as const,
};

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: PRODUCT_KEYS.all }); toast.success('Ürün oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: UpdateProductDTO) => updateProduct(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCT_KEYS.all });
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: PRODUCT_KEYS.all }); toast.success('Ürün silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
