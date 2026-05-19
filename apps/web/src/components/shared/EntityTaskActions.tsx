'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, CheckSquare, Clock3, Eye } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useCreateTask } from '@/hooks/useWorkflow';
import type { AuditEntityType } from '@/services/audit-log.service';
import type { CreateTaskDTO, TaskPriority } from '@/services/task.service';

interface EntityTaskActionsProps {
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  module: string;
  href?: string;
}

type TaskModalMode = 'task' | 'reminder';

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'LOW', label: 'Düşük' },
  { value: 'MEDIUM', label: 'Orta' },
  { value: 'HIGH', label: 'Yüksek' },
  { value: 'CRITICAL', label: 'Kritik' },
];

function isTaskPriority(value: string): value is TaskPriority {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL';
}

function tomorrowLocalDateTime(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(0, 0, 0);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function EntityTaskActions({ entityType, entityId, entityLabel, module, href }: EntityTaskActionsProps) {
  const createTask = useCreateTask();
  const pathname = usePathname();
  const [mode, setMode] = useState<TaskModalMode | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueAt, setDueAt] = useState('');

  const resolvedHref = href ?? pathname;
  const followSource = useMemo(() => `follow:${entityType}:${entityId}`, [entityId, entityType]);

  const openModal = (nextMode: TaskModalMode) => {
    setMode(nextMode);
    setPriority(nextMode === 'reminder' ? 'HIGH' : 'MEDIUM');
    setDueAt(nextMode === 'reminder' ? tomorrowLocalDateTime() : '');
    setTitle(nextMode === 'reminder' ? `${entityLabel} için hatırlatma` : `${entityLabel} için görev`);
    setDetail('');
  };

  const closeModal = () => {
    if (createTask.isPending) return;
    setMode(null);
  };

  const basePayload = (): Pick<CreateTaskDTO, 'module' | 'entityType' | 'entityId' | 'href'> => ({
    module,
    entityType,
    entityId,
    href: resolvedHref,
  });

  const handleFollow = () => {
    createTask.mutate({
      ...basePayload(),
      title: `${entityLabel} takip edilecek`,
      detail: 'Bu kayıt takip listesine eklendi.',
      type: 'GENERAL',
      priority: 'LOW',
      source: followSource,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !mode) return;

    createTask.mutate(
      {
        ...basePayload(),
        title: trimmedTitle,
        detail: detail.trim() || null,
        type: 'GENERAL',
        priority,
        dueAt: toIsoDateTime(dueAt),
        source: mode === 'reminder' ? `reminder:${entityType}:${entityId}:${dueAt || Date.now()}` : null,
      },
      { onSuccess: closeModal },
    );
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Görev ve Takip</h3>
          <p className="mt-1 text-xs text-slate-500">Bu kayıt için görev, takip veya hatırlatma oluşturun.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" leftIcon={<CheckSquare className="h-3.5 w-3.5" />} onClick={() => openModal('task')}>
          Görev oluştur
        </Button>
        <Button size="sm" variant="outline" leftIcon={<Eye className="h-3.5 w-3.5" />} onClick={handleFollow} loading={createTask.isPending}>
          Takip et
        </Button>
        <Button size="sm" variant="outline" leftIcon={<Clock3 className="h-3.5 w-3.5" />} onClick={() => openModal('reminder')}>
          Bana hatırlat
        </Button>
      </div>

      <Modal
        isOpen={mode !== null}
        onClose={closeModal}
        title={mode === 'reminder' ? 'Hatırlatma oluştur' : 'Görev oluştur'}
        description={entityLabel}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={createTask.isPending}>İptal</Button>
            <Button type="submit" form="entity-task-form" leftIcon={<Bell className="h-4 w-4" />} loading={createTask.isPending}>
              Kaydet
            </Button>
          </>
        }
      >
        <form id="entity-task-form" onSubmit={handleSubmit} className="space-y-4">
          <Input label="Başlık" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <Textarea label="Açıklama" value={detail} onChange={(event) => setDetail(event.target.value)} rows={4} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Öncelik"
              value={priority}
              onChange={(event) => {
                if (isTaskPriority(event.target.value)) setPriority(event.target.value);
              }}
              options={PRIORITY_OPTIONS}
            />
            <Input
              label="Hatırlatma tarihi"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              helperText="Boş bırakılırsa tarih atanmaz."
            />
          </div>
        </form>
      </Modal>
    </section>
  );
}
