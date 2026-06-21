'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardEdit, Mail, Paperclip, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { EntityActivityTimeline } from '@/components/shared/EntityActivityTimeline';
import { EntityTaskActions } from '@/components/shared/EntityTaskActions';
import { RecommendedActionsPanel, type RecommendedEntityAction } from '@/components/shared/RecommendedActionsPanel';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useCreateApprovalRequest, useApprovalFlows } from '@/hooks/useApprovals';
import { useCurrentUser } from '@/hooks/useAuth';
import { useSendMail } from '@/hooks/useMail';
import { useCreateTask } from '@/hooks/useWorkflow';
import type { AuditEntityType } from '@/services/audit-log.service';
import type { ApprovalModule } from '@/services/approval.service';
import type { SendMailDTO } from '@/services/mail.service';

export type EntityAction =
  | 'mail'
  | 'task'
  | 'attachment'
  | 'note'
  | 'activity'
  | 'approval';

export interface EntityActionPanelProps {
  entityType: AuditEntityType;
  entityId: string;
  displayName: string;
  module: string;
  primaryEmail?: string | null;
  availableActions?: readonly EntityAction[];
  recommendedActions?: readonly RecommendedEntityAction[];
  href?: string;
}

interface MailAttachmentDraft {
  filename: string;
  content: string;
  contentType?: string;
  size: number;
}

const DEFAULT_ACTIONS: readonly EntityAction[] = ['mail', 'task', 'attachment', 'note', 'activity', 'approval'];

const APPROVAL_MODULE_BY_ENTITY: Partial<Record<AuditEntityType, ApprovalModule>> = {
  INVOICE: 'INVOICE',
  SALES_ORDER: 'SALES_ORDER',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  SERVICE_REQUEST: 'SERVICE_REQUEST',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(value: string): string {
  return escapeHtml(value)
    .split('\n')
    .map((line) => (line.trim() ? line : '&nbsp;'))
    .join('<br>');
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsAttachment(file: File): Promise<MailAttachmentDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const [, base64 = ''] = result.split(',');
      resolve({
        filename: file.name,
        content: base64,
        contentType: file.type || undefined,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error(`${file.name} okunamadı.`));
    reader.readAsDataURL(file);
  });
}

function toMailAttachments(attachments: MailAttachmentDraft[]): NonNullable<SendMailDTO['attachments']> {
  return attachments.map(({ filename, content, contentType }) => ({
    filename,
    content,
    ...(contentType && { contentType }),
  }));
}

function parseRecipients(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

export function EntityActionPanel({
  entityType,
  entityId,
  displayName,
  module,
  primaryEmail,
  availableActions = DEFAULT_ACTIONS,
  recommendedActions = [],
  href,
}: EntityActionPanelProps) {
  const actions = useMemo(() => new Set<EntityAction>(availableActions), [availableActions]);
  const { user } = useCurrentUser();
  const sendMail = useSendMail();
  const createTask = useCreateTask();
  const createApprovalRequest = useCreateApprovalRequest();
  const approvalModule = APPROVAL_MODULE_BY_ENTITY[entityType] ?? 'OTHER';
  const { data: approvalFlows } = useApprovalFlows({ module: approvalModule, isActive: 'true', limit: 50 });
  const activeFlows = approvalFlows?.data ?? [];

  const [mailOpen, setMailOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [mailTo, setMailTo] = useState(primaryEmail ?? '');
  const [mailSubject, setMailSubject] = useState(`${displayName} hakkında`);
  const [mailBody, setMailBody] = useState('');
  const [mailAttachments, setMailAttachments] = useState<MailAttachmentDraft[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [approvalNote, setApprovalNote] = useState('');

  const canMail = actions.has('mail');
  const mailRecipients = parseRecipients(mailTo);
  const canSendMail = mailRecipients.length > 0 && Boolean(mailSubject.trim() && mailBody.trim()) && !sendMail.isPending && !isReadingFiles;

  const resetMail = () => {
    setMailOpen(false);
    setMailTo(primaryEmail ?? '');
    setMailSubject(`${displayName} hakkında`);
    setMailBody('');
    setMailAttachments([]);
    setFileError(null);
    setIsReadingFiles(false);
  };

  const handleMailFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setFileError(null);
    if (files.length === 0) return;

    if (mailAttachments.length + files.length > 5) {
      setFileError('En fazla 5 dosya ekleyebilirsiniz.');
      return;
    }
    const tooLarge = files.find((file) => file.size > 5 * 1024 * 1024);
    if (tooLarge) {
      setFileError(`${tooLarge.name} 5 MB sınırını aşıyor.`);
      return;
    }
    const currentSize = mailAttachments.reduce((sum, item) => sum + item.size, 0);
    const nextSize = files.reduce((sum, file) => sum + file.size, currentSize);
    if (nextSize > 10 * 1024 * 1024) {
      setFileError('Toplam dosya eki boyutu 10 MB sınırını aşıyor.');
      return;
    }

    setIsReadingFiles(true);
    try {
      const nextAttachments = await Promise.all(files.map(readFileAsAttachment));
      setMailAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Dosya okunamadı.');
    } finally {
      setIsReadingFiles(false);
    }
  };

  const handleSendMail = async () => {
    await sendMail.mutateAsync({
      to: mailRecipients.length === 1 ? mailRecipients[0] : mailRecipients,
      subject: mailSubject.trim(),
      html: textToHtml(mailBody.trim()),
      ...(user?.email && { replyTo: user.email }),
      ...(mailAttachments.length > 0 && { attachments: toMailAttachments(mailAttachments) }),
    });
    resetMail();
  };

  const handleCreateNote = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    await createTask.mutateAsync({
      title: `${displayName} notu`,
      detail: trimmed,
      type: 'GENERAL',
      priority: 'LOW',
      module,
      entityType,
      entityId,
      href,
      source: `note:${entityType}:${entityId}:${Date.now()}`,
    });
    setNoteText('');
    setNoteOpen(false);
  };

  const handleApproval = async () => {
    if (!selectedFlowId) return;
    await createApprovalRequest.mutateAsync({
      flowId: selectedFlowId,
      entityType,
      entityId,
      notes: approvalNote.trim() || undefined,
    });
    setApprovalNote('');
    setSelectedFlowId('');
    setApprovalOpen(false);
  };

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Aksiyonlar</h3>
          <p className="mt-1 truncate text-sm font-medium text-slate-100">{displayName}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.has('mail') && (
            <Button size="sm" variant="secondary" disabled={!canMail} leftIcon={<Mail className="h-3.5 w-3.5" />} onClick={() => setMailOpen(true)}>
              Mail
            </Button>
          )}
          {actions.has('note') && (
            <Button size="sm" variant="outline" leftIcon={<ClipboardEdit className="h-3.5 w-3.5" />} onClick={() => setNoteOpen(true)}>
              Not
            </Button>
          )}
          {actions.has('approval') && (
            <Button size="sm" variant="outline" leftIcon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => setApprovalOpen(true)}>
              Onaya gönder
            </Button>
          )}
          {actions.has('attachment') && (
            <div className="flex h-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/70 text-xs font-medium text-slate-400">
              <Paperclip className="mr-1.5 h-3.5 w-3.5" /> Dosya
            </div>
          )}
        </div>
      </section>

      <RecommendedActionsPanel actions={recommendedActions} />
      {actions.has('task') && <EntityTaskActions entityType={entityType} entityId={entityId} entityLabel={displayName} module={module} href={href} />}
      {actions.has('attachment') && <AttachmentPanel entityType={entityType} entityId={entityId} />}
      {actions.has('activity') && <EntityActivityTimeline entityType={entityType} entityId={entityId} />}

      <Modal
        isOpen={mailOpen}
        onClose={resetMail}
        title="Mail gönder"
        description={displayName}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={resetMail} disabled={sendMail.isPending}>İptal</Button>
            <Button onClick={handleSendMail} disabled={!canSendMail} loading={sendMail.isPending} leftIcon={<Send className="h-4 w-4" />}>
              {isReadingFiles ? 'Dosya okunuyor' : 'Gönder'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Kime</span>
            <input
              value={mailTo}
              onChange={(event) => setMailTo(event.target.value)}
              placeholder="Birden fazla adres icin virgul veya yeni satir kullanin"
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/60"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Konu</span>
            <input value={mailSubject} onChange={(event) => setMailSubject(event.target.value)} className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Açıklama</span>
            <textarea value={mailBody} onChange={(event) => setMailBody(event.target.value)} rows={8} className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-sky-500/60" />
          </label>
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:border-sky-500/50 hover:text-sky-300">
                <Paperclip className="h-3.5 w-3.5" />
                Dosya ekle
                <input type="file" multiple className="hidden" onChange={handleMailFiles} />
              </label>
              <span className="text-[11px] text-slate-600">5 dosya, toplam 10 MB</span>
            </div>
            {fileError && <p className="mt-2 text-xs text-red-400">{fileError}</p>}
            {mailAttachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {mailAttachments.map((attachment) => (
                  <div key={`${attachment.filename}-${attachment.size}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200">{attachment.filename}</p>
                      <p className="text-[11px] text-slate-500">{formatFileSize(attachment.size)}</p>
                    </div>
                    <button type="button" onClick={() => setMailAttachments((current) => current.filter((item) => item !== attachment))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-300" aria-label="Dosya ekini kaldır">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Not ekle"
        description={displayName}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setNoteOpen(false)} disabled={createTask.isPending}>İptal</Button>
            <Button onClick={handleCreateNote} disabled={!noteText.trim()} loading={createTask.isPending} leftIcon={<ClipboardEdit className="h-4 w-4" />}>Kaydet</Button>
          </>
        )}
      >
        <Textarea label="Not" value={noteText} onChange={(event) => setNoteText(event.target.value)} rows={6} />
      </Modal>

      <Modal
        isOpen={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        title="Onaya gönder"
        description={displayName}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setApprovalOpen(false)} disabled={createApprovalRequest.isPending}>İptal</Button>
            <Button onClick={handleApproval} disabled={!selectedFlowId} loading={createApprovalRequest.isPending} leftIcon={<CheckCircle2 className="h-4 w-4" />}>Gönder</Button>
          </>
        )}
      >
        <div className="space-y-4">
          {activeFlows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-500">
              Bu kayıt tipi için aktif onay akışı bulunamadı.
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Onay akışı</span>
              <select value={selectedFlowId} onChange={(event) => setSelectedFlowId(event.target.value)} className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60">
                <option value="">Akış seçin</option>
                {activeFlows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
              </select>
            </label>
          )}
          <Textarea label="Not" value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} rows={4} />
        </div>
      </Modal>
    </aside>
  );
}
