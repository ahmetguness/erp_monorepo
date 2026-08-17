'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  dispatchZeroTouchPo,
  getProcurementProjections,
  getSupplierReliabilityScores,
  runProcurementBatchScan,
} from '@/services/procurement.autonomy.service';

export function useProcurementProjections() {
  return useQuery({
    queryKey: ['procurement-autonomy', 'projections'],
    queryFn: () => getProcurementProjections(),
  });
}

export function useSupplierReliabilityScores() {
  return useQuery({
    queryKey: ['procurement-autonomy', 'suppliers'],
    queryFn: () => getSupplierReliabilityScores(),
  });
}

export function useDispatchZeroTouchPo() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ productId, autoDispatch }: { productId: string; autoDispatch?: boolean }) =>
      dispatchZeroTouchPo(productId, autoDispatch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['procurement-autonomy'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(
        `Otonom Satın Alma Siparişi #${data.purchaseOrderNumber} (${data.supplierName}) başarıyla iletildi!`,
      );
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useRunProcurementBatchScan() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (autoDispatch: boolean = true) => runProcurementBatchScan(autoDispatch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['procurement-autonomy'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(
        `Otonom Tedarik Taraması Tamamlandı! ${data.scannedProducts} ürün tarandı, ${data.dispatchedOrders.length} adet Satın Alma Siparişi otomatik iletildi.`,
      );
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
