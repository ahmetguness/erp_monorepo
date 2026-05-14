'use client';

import { useMutation } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  sendGenericNotificationMail,
  sendInvoiceNotificationMail,
  sendMail,
  sendPasswordResetMail,
  sendWelcomeMail,
  type GenericNotificationMailDTO,
  type InvoiceNotificationMailDTO,
  type PasswordResetMailDTO,
  type SendMailDTO,
  type WelcomeMailDTO,
} from '@/services/mail.service';

function useMailMutation<TPayload>(mutationFn: (data: TPayload) => Promise<unknown>, successMessage: string) {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn,
    onSuccess: () => toast.success(successMessage),
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useSendMail() {
  return useMailMutation<SendMailDTO>(sendMail, 'Mail gönderildi.');
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
