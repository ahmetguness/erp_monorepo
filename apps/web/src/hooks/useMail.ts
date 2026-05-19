'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getMail,
  listMail,
  sendBulkMail,
  sendGenericNotificationMail,
  sendInvoiceNotificationMail,
  sendMail,
  sendPasswordResetMail,
  sendWelcomeMail,
  type BulkMailDTO,
  type GenericNotificationMailDTO,
  type InvoiceNotificationMailDTO,
  type ListMailParams,
  type PasswordResetMailDTO,
  type SendMailDTO,
  type WelcomeMailDTO,
} from '@/services/mail.service';

function useMailMutation<TPayload>(mutationFn: (data: TPayload) => Promise<unknown>, successMessage: string) {
  const { toast } = useUIStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      toast.success(successMessage);
      queryClient.invalidateQueries({ queryKey: ['mail'] });
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useMailHistory(params: ListMailParams) {
  return useQuery({
    queryKey: ['mail', 'list', params],
    queryFn: () => listMail(params),
  });
}

export function useMailMessage(id: string | null) {
  return useQuery({
    queryKey: ['mail', 'detail', id],
    queryFn: () => getMail(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useSendMail() {
  return useMailMutation<SendMailDTO>(sendMail, 'Mail gönderildi.');
}

export function useSendBulkMail() {
  return useMailMutation<BulkMailDTO>(sendBulkMail, 'Toplu mail gönderildi.');
}

export function useSendWelcomeMail() {
  return useMailMutation<WelcomeMailDTO>(sendWelcomeMail, 'Hoş geldin maili gönderildi.');
}

export function useSendPasswordResetMail() {
  return useMailMutation<PasswordResetMailDTO>(sendPasswordResetMail, 'Şifre sıfırlama maili gönderildi.');
}

export function useSendInvoiceNotificationMail() {
  return useMailMutation<InvoiceNotificationMailDTO>(sendInvoiceNotificationMail, 'Fatura bildirimi gönderildi.');
}

export function useSendGenericNotificationMail() {
  return useMailMutation<GenericNotificationMailDTO>(sendGenericNotificationMail, 'Bildirim maili gönderildi.');
}
