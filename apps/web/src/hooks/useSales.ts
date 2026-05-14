'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getSalesQuotes, getSalesQuoteById, createSalesQuote, convertQuoteToOrder,
  getSalesOrders, getSalesOrderById, getSalesOrderHistory, createSalesOrder, updateSalesOrder, cancelSalesOrder,
  getInvoices, getInvoiceById, getInvoiceHistory, createInvoice, updateInvoice, cancelInvoice,
  type ListParams, type CreateSalesQuoteDTO, type CreateSalesOrderDTO,
  type CreateInvoiceDTO, type OrderStatus, type InvoiceStatus,
} from '@/services/sales.service';

const QUOTE_KEYS = {
  all: ['quotes'] as const,
  list: (p: ListParams) => ['quotes', 'list', p] as const,
  detail: (id: string) => ['quotes', id] as const,
};

const ORDER_KEYS = {
  all: ['sales-orders'] as const,
  list: (p: ListParams) => ['sales-orders', 'list', p] as const,
  detail: (id: string) => ['sales-orders', id] as const,
  history: (id: string) => ['sales-orders', id, 'history'] as const,
};

const INVOICE_KEYS = {
  all: ['invoices'] as const,
  list: (p: ListParams) => ['invoices', 'list', p] as const,
  detail: (id: string) => ['invoices', id] as const,
  history: (id: string) => ['invoices', id, 'history'] as const,
};

// ── Quotes ───────────────────────────────────

export function useSalesQuotes(params: ListParams) {
  return useQuery({ queryKey: QUOTE_KEYS.list(params), queryFn: () => getSalesQuotes(params) });
}

export function useSalesQuote(id: string) {
  return useQuery({ queryKey: QUOTE_KEYS.detail(id), queryFn: () => getSalesQuoteById(id), enabled: !!id });
}

export function useCreateSalesQuote() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateSalesQuoteDTO) => createSalesQuote(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUOTE_KEYS.all }); toast.success('Teklif oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useConvertQuoteToOrder(quoteId: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => convertQuoteToOrder(quoteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUOTE_KEYS.all });
      qc.invalidateQueries({ queryKey: ORDER_KEYS.all });
      toast.success('Teklif siparişe dönüştürüldü.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Orders ───────────────────────────────────

export function useSalesOrders(params: ListParams) {
  return useQuery({ queryKey: ORDER_KEYS.list(params), queryFn: () => getSalesOrders(params) });
}

export function useSalesOrder(id: string) {
  return useQuery({ queryKey: ORDER_KEYS.detail(id), queryFn: () => getSalesOrderById(id), enabled: !!id });
}

export function useSalesOrderHistory(id: string) {
  return useQuery({ queryKey: ORDER_KEYS.history(id), queryFn: () => getSalesOrderHistory(id), enabled: !!id });
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateSalesOrderDTO) => createSalesOrder(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ORDER_KEYS.all }); toast.success('Sipariş oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateSalesOrder(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: { dueDate?: string; notes?: string; status?: OrderStatus }) => updateSalesOrder(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORDER_KEYS.all });
      qc.invalidateQueries({ queryKey: ORDER_KEYS.detail(id) });
      toast.success('Sipariş güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCancelSalesOrder(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => cancelSalesOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORDER_KEYS.all });
      qc.invalidateQueries({ queryKey: ORDER_KEYS.detail(id) });
      toast.success('Sipariş iptal edildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Invoices ─────────────────────────────────

export function useInvoices(params: ListParams) {
  return useQuery({ queryKey: INVOICE_KEYS.list(params), queryFn: () => getInvoices(params) });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: INVOICE_KEYS.detail(id), queryFn: () => getInvoiceById(id), enabled: !!id });
}

export function useInvoiceHistory(id: string) {
  return useQuery({ queryKey: INVOICE_KEYS.history(id), queryFn: () => getInvoiceHistory(id), enabled: !!id });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateInvoiceDTO) => createInvoice(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: INVOICE_KEYS.all }); toast.success('Fatura oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCancelInvoice(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => cancelInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.all });
      qc.invalidateQueries({ queryKey: INVOICE_KEYS.detail(id) });
      toast.success('Fatura iptal edildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
