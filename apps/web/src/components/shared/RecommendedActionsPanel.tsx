'use client';

import { useMemo, useState } from 'react';
import { Bell, CheckCircle2, ClipboardList, Mail, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useCurrentUser } from '@/hooks/useAuth';
import { useSendMail } from '@/hooks/useMail';
import { useCreateTask } from '@/hooks/useWorkflow';
import type { AuditEntityType } from '@/services/audit-log.service';
import type { SendMailDTO } from '@/services/mail.service';
import type { CreateTaskDTO, TaskPriority, TaskType } from '@/services/task.service';

type RecommendedActionKind = 'mail' | 'task';

export interface RecommendedActionBase {
  id: string;
  kind: RecommendedActionKind;
  title: string;
  summary: string;
  priority: TaskPriority;
  entityType: AuditEntityType;
  entityId: string;
  module: string;
  href?: string;
  steps: readonly string[];
}

export interface RecommendedMailAction extends RecommendedActionBase {
  kind: 'mail';
  draft: {
    to: string;
    subject: string;
    body: string;
    replyTo?: string;
  };
}

export interface RecommendedTaskAction extends RecommendedActionBase {
  kind: 'task';
  draft: {
    title: string;
    detail: string;
    type: TaskType;
    dueAt?: string | null;
  };
}

export type RecommendedEntityAction = RecommendedMailAction | RecommendedTaskAction;

interface RecommendedActionsPanelProps {
  actions: readonly RecommendedEntityAction[];
}

const PRIORITY_LABELS: Record<TaskPriority, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  LOW: { label: 'Düşük', variant: 'neutral' },
  MEDIUM: { label: 'Orta', variant: 'info' },
  HIGH: { label: 'Yüksek', variant: 'warning' },
  CRITICAL: { label: 'Kritik', variant: 'danger' },
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

function buildTaskPayload(action: RecommendedTaskAction): CreateTaskDTO {
  return {
    title: action.draft.title,
    detail: action.draft.detail,
    type: action.draft.type,
    priority: action.priority,
    module: action.module,
    entityType: action.entityType,
    entityId: action.entityId,
    href: action.href,
    source: `recommended:${action.id}`,
    dueAt: action.draft.dueAt ?? null,
  };
}

function buildMailPayload(action: RecommendedMailAction): SendMailDTO {
  return {
    to: action.draft.to,
    subject: action.draft.subject,
    html: textToHtml(action.draft.body),
    ...(action.draft.replyTo && { replyTo: action.draft.replyTo }),
  };
}

function formatDraft(action: RecommendedEntityAction): string {
  if (action.kind === 'mail') {
    return [
      `Kime: ${action.draft.to}`,
      `Konu: ${action.draft.subject}`,
      '',
      action.draft.body,
    ].join('\n');
  }

  return [
    `Görev: ${action.draft.title}`,
    `Tip: ${action.draft.type}`,
    action.draft.dueAt ? `Termin: ${new Date(action.draft.dueAt).toLocaleDateString('tr-TR')}` : null,
    '',
    action.draft.detail,
  ].filter((line): line is string => line !== null).join('\n');
}

export function RecommendedActionsPanel({ actions }: RecommendedActionsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<ReadonlySet<string>>(new Set());
  const { user } = useCurrentUser();
  const sendMail = useSendMail();
  const createTask = useCreateTask();

  const selected = useMemo(
    () => actions.find((action) => action.id === selectedId) ?? null,
    [actions, selectedId],
  );
  const isApplying = sendMail.isPending || createTask.isPending;

  if (actions.length === 0) return null;

  const applySelected = async () => {
    if (!selected) return;

    try {
      if (selected.kind === 'mail') {
        await sendMail.mutateAsync({
          ...buildMailPayload(selected),
          ...(!selected.draft.replyTo && user?.email && { replyTo: user.email }),
        });
      } else {
        await createTask.mutateAsync(buildTaskPayload(selected));
      }
    } catch {
      return;
    }

    setAppliedIds((current) => new Set([...current, selected.id]));
    setSelectedId(null);
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 text-sky-400" />
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Önerilen aksiyonlar</h3>
          <p className="mt-1 text-xs text-slate-500">Taslağı inceleyip onaylayarak mail veya görev akışına bağlayın.</p>
        </div>
      </div>

      <div className="space-y-2">
        {actions.map((action) => {
          const applied = appliedIds.has(action.id);
          const priority = PRIORITY_LABELS[action.priority];
          return (
            <div key={action.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-100">{action.title}</span>
                    <Badge variant={priority.variant}>{priority.label}</Badge>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">{action.summary}</p>
                </div>
                <span className="shrink-0 rounded-md bg-slate-900 p-1.5 text-slate-400">
                  {action.kind === 'mail' ? <Mail className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                </span>
              </div>
              <Button
                size="sm"
                variant={applied ? 'outline' : 'secondary'}
                className="mt-3 w-full"
                disabled={applied}
                leftIcon={applied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                onClick={() => setSelectedId(action.id)}
              >
                {applied ? 'Takipte' : 'Taslağı gör'}
              </Button>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title ?? 'Aksiyon taslağı'}
        description={selected?.summary}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSelectedId(null)} disabled={isApplying}>İptal</Button>
            <Button onClick={applySelected} loading={isApplying} leftIcon={<CheckCircle2 className="h-4 w-4" />}>
              Onayla ve uygula
            </Button>
          </>
        )}
      >
        {selected && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Akış</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {selected.steps.map((step, index) => (
                  <div key={`${selected.id}-${index}-${step}`} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <span className="text-[10px] text-slate-600">{index + 1}</span>
                    <p className="mt-1 text-xs font-medium text-slate-300">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">{selected.kind === 'mail' ? 'Mail taslağı' : 'Görev taslağı'}</span>
              <textarea
                readOnly
                value={formatDraft(selected)}
                rows={10}
                className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-200 outline-none"
              />
            </label>
          </div>
        )}
      </Modal>
    </section>
  );
}
