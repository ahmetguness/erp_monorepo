'use client';

import { useMemo, useState } from 'react';
import { Bot, Eye, Save, ShieldCheck } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAiGovernanceLogs, useAiGovernancePolicy, useUpdateAiGovernancePolicy } from '@/hooks/useIntelligence';
import { formatDateTime } from '@/lib/utils';
import type { AiGovernancePolicy, AiRequestLog, AiRequestStatus, AiRequestType } from '@/services/intelligence.service';

const STATUS_META: Record<AiRequestStatus, { label: string; variant: BadgeVariant }> = {
  STARTED: { label: 'Basladi', variant: 'info' },
  SUCCEEDED: { label: 'Basarili', variant: 'success' },
  FAILED: { label: 'Hatali', variant: 'danger' },
  FALLBACK: { label: 'Fallback', variant: 'warning' },
};

const TYPE_LABELS: Record<AiRequestType, string> = {
  PRIVATE_CHAT: 'Chat',
  PUBLIC_CHAT: 'Public chat',
  MAIL_DRAFT: 'Mail taslak',
  SMART_FORM: 'Akilli form',
  RECOMMENDED_ACTION: 'Aksiyon',
  OTHER: 'Diger',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCost(value: unknown): string {
  if (!isRecord(value)) return '-';
  const governance = value.governance;
  if (!isRecord(governance)) return '-';
  const cost = governance.tokenCostEstimateUsd;
  return typeof cost === 'number' ? `$${cost.toFixed(6)}` : '-';
}

function shortText(value: string | null, fallback = '-'): string {
  if (!value) return fallback;
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{title}</p>
      <pre className="max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AiGovernancePage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AiRequestStatus | ''>('');
  const [requestType, setRequestType] = useState<AiRequestType | ''>('');
  const [detail, setDetail] = useState<AiRequestLog | null>(null);
  const { data, isLoading } = useAiGovernanceLogs({
    page,
    limit: 30,
    status: status || undefined,
    requestType: requestType || undefined,
  });
  const { data: policyData } = useAiGovernancePolicy();
  const updatePolicy = useUpdateAiGovernancePolicy();

  const policy = policyData?.policy;
  const columns = useMemo<ColumnDef<AiRequestLog>[]>(() => [
    {
      key: 'createdAt',
      header: 'Tarih',
      width: '150px',
      render: (row) => <span className="text-xs tabular-nums text-slate-400">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'type',
      header: 'Akis',
      width: '130px',
      render: (row) => <span className="text-xs font-medium text-slate-300">{TYPE_LABELS[row.requestType]}</span>,
    },
    {
      key: 'status',
      header: 'Durum',
      width: '120px',
      render: (row) => <Badge variant={STATUS_META[row.status].variant}>{STATUS_META[row.status].label}</Badge>,
    },
    {
      key: 'summary',
      header: 'Ozet',
      render: (row) => (
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm text-slate-200">{shortText(row.inputSummary, 'Girdi yok')}</p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{shortText(row.outputSummary, 'Cikti yok')}</p>
        </div>
      ),
    },
    {
      key: 'governance',
      header: 'Governance',
      width: '220px',
      render: (row) => (
        <div className="space-y-1 text-xs text-slate-400">
          <p>{row.model} / {row.promptVersion}</p>
          <p>Token: {row.tokenTotal ?? '-'} / Maliyet: {readCost(row.result)}</p>
          <p>Yetki: {row.permissionCheckResult}</p>
        </div>
      ),
    },
    {
      key: 'detail',
      header: '',
      width: '60px',
      align: 'right',
      render: (row) => (
        <button
          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-sky-500/10 hover:text-sky-400"
          onClick={(event) => {
            event.stopPropagation();
            setDetail(row);
          }}
          aria-label="AI log detayini ac"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ], []);

  const savePolicy = (next: AiGovernancePolicy) => updatePolicy.mutate(next);

  return (
    <div className="space-y-4">
      <PageHeader title="AI Governance" subtitle="AI istekleri, izin sonucu, maskeleme ve kullanici aksiyon zinciri." />

      {policy && (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-lg bg-sky-500/10 p-2 text-sky-300"><Bot className="h-4 w-4" /></span>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Tenant AI Politikası</h2>
              <p className="text-xs text-slate-500">Owner veya ai_governance yetkili roller tarafından yönetilir.</p>
            </div>
            <Button
              className="ml-auto"
              size="sm"
              leftIcon={<Save className="h-3.5 w-3.5" />}
              loading={updatePolicy.isPending}
              onClick={() => savePolicy(policy)}
            >
              Kaydet
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <button
              type="button"
              className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-left"
              onClick={() => savePolicy({ ...policy, enabled: !policy.enabled })}
            >
              <span className="text-xs text-slate-500">AI durumu</span>
              <p className="mt-1 text-sm font-semibold text-slate-100">{policy.enabled ? 'Acik' : 'Kapali'}</p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-left"
              onClick={() => savePolicy({
                ...policy,
                dataSharingPolicy: policy.dataSharingPolicy === 'BUSINESS_CONTEXT' ? 'NO_ENTITY_CONTEXT' : 'BUSINESS_CONTEXT',
              })}
            >
              <span className="text-xs text-slate-500">Veri paylasimi</span>
              <p className="mt-1 text-sm font-semibold text-slate-100">{policy.dataSharingPolicy}</p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-left"
              onClick={() => savePolicy({ ...policy, logPrompts: !policy.logPrompts })}
            >
              <span className="text-xs text-slate-500">Prompt ozeti</span>
              <p className="mt-1 text-sm font-semibold text-slate-100">{policy.logPrompts ? 'Kaydedilir' : 'Kaydedilmez'}</p>
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          <h2 className="text-sm font-semibold text-slate-100">Sensitive Field Registry</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {(policyData?.redactionRegistry.fieldKeys ?? []).map((field) => (
            <Badge key={field} variant="neutral">{field}</Badge>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <select className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300" value={requestType} onChange={(event) => { setRequestType(event.target.value as AiRequestType | ''); setPage(1); }}>
          <option value="">Tum akislar</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300" value={status} onChange={(event) => { setStatus(event.target.value as AiRequestStatus | ''); setPage(1); }}>
          <option value="">Tum durumlar</option>
          {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="AI kaydi bulunamadi"
        pagination={data ? { page, pageSize: 30, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      <Modal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title="AI Detayi" size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div><span className="text-slate-500">Akis</span><p className="text-slate-200">{TYPE_LABELS[detail.requestType]}</p></div>
              <div><span className="text-slate-500">Durum</span><p className="text-slate-200">{STATUS_META[detail.status].label}</p></div>
              <div><span className="text-slate-500">Model</span><p className="text-slate-200">{detail.model}</p></div>
              <div><span className="text-slate-500">Token</span><p className="text-slate-200">{detail.tokenTotal ?? '-'}</p></div>
            </div>
            <JsonBlock title="Entity Context" value={detail.entityContext} />
            <JsonBlock title="Draft" value={detail.draft} />
            <JsonBlock title="Result" value={detail.result} />
            {detail.errorMessage && <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{detail.errorMessage}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
