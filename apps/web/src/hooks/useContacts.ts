'use client';
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getContacts, getContactById, createContact, updateContact, deleteContact, getAccountEntries, getCustomerTrackingDashboard,
  getSupplierPerformance,
  type ContactListParams, type CreateContactDTO, type UpdateContactDTO, type AccountEntryListParams,
} from '@/services/contact.service';

export const CONTACT_KEYS = {
  all: ['contacts'] as const,
  list: (params: ContactListParams) => ['contacts', 'list', params] as const,
  detail: (id: string) => ['contacts', id] as const,
  entries: (id: string, params: AccountEntryListParams) => ['contacts', id, 'entries', params] as const,
  trackingDashboard: (limit: number) => ['contacts', 'tracking-dashboard', limit] as const,
  performance: (id: string) => ['contacts', id, 'performance'] as const,
};

function invalidateContactSetupQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: CONTACT_KEYS.all });
  qc.invalidateQueries({ queryKey: ['settings', 'setup-checklist'] });
}

export function useContacts(params: ContactListParams) {
  return useQuery({
    queryKey: CONTACT_KEYS.list(params),
    queryFn: () => getContacts(params),
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: CONTACT_KEYS.detail(id),
    queryFn: () => getContactById(id),
    enabled: !!id,
  });
}

export function useCustomerTrackingDashboard(limit = 8) {
  return useQuery({
    queryKey: CONTACT_KEYS.trackingDashboard(limit),
    queryFn: () => getCustomerTrackingDashboard(limit),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateContactDTO) => createContact(data),
    onSuccess: () => {
      invalidateContactSetupQueries(qc);
      toast.success('Cari hesap oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: UpdateContactDTO) => updateContact(id, data),
    onSuccess: () => {
      invalidateContactSetupQueries(qc);
      qc.invalidateQueries({ queryKey: CONTACT_KEYS.detail(id) });
      toast.success('Cari hesap güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => {
      invalidateContactSetupQueries(qc);
      toast.success('Cari hesap silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useAccountEntries(contactId: string, params: AccountEntryListParams) {
  return useQuery({
    queryKey: CONTACT_KEYS.entries(contactId, params),
    queryFn: () => getAccountEntries(contactId, params),
    enabled: !!contactId,
  });
}

export function useSupplierPerformance(contactId: string) {
  return useQuery({
    queryKey: CONTACT_KEYS.performance(contactId),
    queryFn: () => getSupplierPerformance(contactId),
    enabled: !!contactId,
  });
}
