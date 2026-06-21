'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useDomainEventFailures, useReplayDomainEvent } from '@/hooks/useDomainEvents';
import { formatDateTime } from '@/lib/utils';
import type { DomainEventOutbox, DomainEventStatus } from '@/services/domain-event.service';

const STATUS_META: Record<DomainEventStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Bekliyor', variant: 'neutral' },
  PROCESSING: { label: 'Isleniyor', variant: 'info' },
  PROCESSED: { label: 'Islendi', variant: 'success' },
  FAILED: { label: 'Hata', variant: 'warning' },
  DEAD_LETTER: { label: 'Dead letter', variant: 'danger' },
};

function shortText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function jsonPreview(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusBadge(status: DomainEventStatus) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function DomainEventFailuresPage() {
  const [page, setPage] = useState(1);
  const [nameFilter, setNameFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<DomainEventOutbox | null>(null);
  const [lastReplayMessage, setLastReplayMessage] = useState<string | null>(null);
  const params = useMemo(() => ({ page, limit: 30, name: nameFilter || undefined }), [page, nameFilter]);
  const { data, isLoading, refetch, isFetching } = useDomainEventFailures(params);
  const replay = useReplayDomainEvent();

  const handleReplay = (event: DomainEventOutbox) => {
    setLastReplayMessage(null);
    replay.mutate(event.id, {
      onSuccess: (result) => {
        setLastReplayMessage(`${result.name}: ${result.message} (${result.beforeStatus} -> ${result.afterStatus})`);
      },
      onError: (error) => {
        setLastReplayMessage(error instanceof Error ? error.message : 'Replay basarisiz oldu.');
      },
    });
  };

  const columns: ColumnDef<DomainEventOutbox>[] = [
    {
      key: 'updatedAt',
      header: 'Son Durum',
      width: '150px',
      render: (row) => <span className="text-xs tabular-nums text-slate-400">{formatDateTime(row.updatedAt)}</span>,
    },
    {
      key: 'name',
      header: 'Event',
      width: '220px',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-200">{row.name}</p>
          <p className="truncate font-mono text-[10px] text-slate-600">{row.source}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (row) => statusBadge(row.status),
    },
    {
      key: 'attempts',
      header: 'Deneme',
      width: '90px',
      align: 'right',
      render: (row) => <span className="text-xs tabular-nums text-slate-300">{row.attempts}</span>,
    },
    {
      key: 'error',
      header: 'Hata',
      render: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedEvent(row);
          }}
          className="max-w-xl text-left text-xs text-slate-400 transition-colors hover:text-sky-300"
        >
          {shortText(row.lastError ?? 'Listener hatasi detayi yok.', 140)}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      align: 'right',
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
          loading={replay.isPending && replay.variables === row.id}
          onClick={(event) => {
            event.stopPropagation();
            handleReplay(row);
          }}
        >
          Replay
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Domain Event Hatalari" subtitle="Failed ve dead-letter outbox kayitlarini izleyin ve tekrar isleyin." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={nameFilter}
          onChange={(event) => {
            setNameFilter(event.target.value);
            setPage(1);
          }}
          placeholder="Event adi filtrele"
          className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-sky-500 sm:max-w-xs"
        />
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          loading={isFetching}
          onClick={() => void refetch()}
        >
          Yenile
        </Button>
      </div>

      {lastReplayMessage && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          {lastReplayMessage}
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="Domain event hatasi yok"
        pagination={data ? { page, pageSize: 30, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
        onRowClick={setSelectedEvent}
      />

      <Modal isOpen={Boolean(selectedEvent)} onClose={() => setSelectedEvent(null)} title="Domain Event Detayi" size="lg">
        {selectedEvent && (
          <div className="space-y-4">
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <span className="text-slate-500">Event</span>
                <p className="mt-1 font-medium text-slate-200">{selectedEvent.name}</p>
              </div>
              <div>
                <span className="text-slate-500">Status</span>
                <div className="mt-1">{statusBadge(selectedEvent.status)}</div>
              </div>
              <div>
                <span className="text-slate-500">Entity</span>
                <p className="mt-1 font-mono text-slate-300">{selectedEvent.entityType}:{selectedEvent.entityId}</p>
              </div>
              <div>
                <span className="text-slate-500">Idempotency</span>
                <p className="mt-1 break-all font-mono text-slate-300">{selectedEvent.idempotencyKey}</p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Son Hata</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-300">{selectedEvent.lastError ?? '-'}</pre>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Failed Listeners</p>
                <pre className="max-h-52 overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-300">{jsonPreview(selectedEvent.failedListeners)}</pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Payload</p>
                <pre className="max-h-52 overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-300">{jsonPreview(selectedEvent.payload)}</pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
