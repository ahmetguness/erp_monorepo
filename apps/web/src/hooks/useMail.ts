'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  approveMailTemplate,
  createAiMailDraft,
  createMailTemplate,
  deleteMailTemplate,
  getMail,
  listMailTemplates,
  listMail,
  renderMailTemplate,
  sendBulkMail,
  sendGenericNotificationMail,
  sendInvoiceNotificationMail,
  sendMail,
  sendPasswordResetMail,
  sendWelcomeMail,
  updateMailTemplate,
  type ApproveMailTemplateDTO,
  type BulkMailDTO,
  type CreateAiMailDraftDTO,
  type GenericNotificationMailDTO,
  type InvoiceNotificationMailDTO,
  type ListMailParams,
  type MailResult,
  type PasswordResetMailDTO,
  type AiMailDraft,
  type RenderMailTemplateDTO,
  type RenderedMailTemplate,
  type SendMailDTO,
  type UpsertMailTemplateDTO,
  type WelcomeMailDTO,
} from '@/services/mail.service';

function useMailMutation<TPayload, TResult = unknown>(
  mutationFn: (data: TPayload) => Promise<TResult>,
  successMessage: string,
) {
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

export function useMailTemplates() {
  return useQuery({
    queryKey: ['mail', 'templates'],
    queryFn: listMailTemplates,
  });
}

export function useSendMail() {
  return useMailMutation<SendMailDTO, MailResult>(sendMail, 'Mail gönderildi.');
}

export function useSendBulkMail() {
  return useMailMutation<BulkMailDTO>(sendBulkMail, 'Toplu mail gönderildi.');
}

export function useRenderMailTemplate() {
  return useMailMutation<RenderMailTemplateDTO, RenderedMailTemplate>(
    renderMailTemplate,
    'Sablon hazirlandi.',
  );
}

export function useCreateAiMailDraft() {
  return useMailMutation<CreateAiMailDraftDTO, AiMailDraft>(
    createAiMailDraft,
    'AI taslak hazirlandi.',
  );
}

export function useCreateMailTemplate() {
  return useMailMutation<UpsertMailTemplateDTO>(
    createMailTemplate,
    'Sablon kaydedildi.',
  );
}

export function useUpdateMailTemplate() {
  const { toast } = useUIStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpsertMailTemplateDTO }) => updateMailTemplate(id, data),
    onSuccess: () => {
      toast.success('Sablon guncellendi.');
      queryClient.invalidateQueries({ queryKey: ['mail', 'templates'] });
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useApproveMailTemplate() {
  const { toast } = useUIStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApproveMailTemplateDTO }) => approveMailTemplate(id, data),
    onSuccess: () => {
      toast.success('Sablon onay durumu guncellendi.');
      queryClient.invalidateQueries({ queryKey: ['mail', 'templates'] });
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteMailTemplate() {
  const { toast } = useUIStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMailTemplate,
    onSuccess: () => {
      toast.success('Sablon silindi.');
      queryClient.invalidateQueries({ queryKey: ['mail', 'templates'] });
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
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
