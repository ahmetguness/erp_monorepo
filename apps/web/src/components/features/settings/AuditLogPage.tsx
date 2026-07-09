'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Eye, Filter, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { FeatureGate } from '@/components/shared/FeatureGate';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuditLogExport, useAuditLogs } from '@/hooks/useAuditLogs';
import { useTenantUsers } from '@/hooks/useUsers';
import { formatDateTime } from '@/lib/utils';
import type { AuditLog } from '@/services/audit-log.service';

const ACTION_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  CREATE: { label: 'Oluşturma', variant: 'success' },
  UPDATE: { label: 'Güncelleme', variant: 'info' },
  DELETE: { label: 'Silme', variant: 'danger' },
  APPROVE: { label: 'Onay', variant: 'success' },
  REJECT: { label: 'Red', variant: 'warning' },
  LOGIN: { label: 'Giriş', variant: 'neutral' },
  LOGOUT: { label: 'Çıkış', variant: 'neutral' },
  EXPORT: { label: 'Dışa Aktarma', variant: 'info' },
  OTHER: { label: 'Diğer', variant: 'neutral' },
};

const MODULE_LABELS: Record<string, string> = {
  accounting: 'Muhasebe',
  inventory: 'Stok',
  contacts: 'Cari',
  invoicing: 'Fatura',
  reporting: 'Raporlar',
  sales: 'Satış',
  purchasing: 'Satın Alma',
  hr: 'İnsan Kaynakları',
  mail: 'Mail',
  service: 'Servis',
  production: 'Üretim',
};

const ENTITY_LABELS: Record<string, string> = {
  INVOICE: 'Fatura',
  PRODUCT: 'Ürün',
  CATEGORY: 'Kategori',
  CONTACT: 'Cari',
  EMPLOYEE: 'Personel',
  CUSTOMER_ASSET: 'Müşteri Varlığı',
  SERVICE_REQUEST: 'Servis Talebi',
  PURCHASE_ORDER: 'Satın Alma Siparişi',
  SALES_QUOTE: 'Teklif',
  SALES_ORDER: 'Satış Siparişi',
  WORK_ORDER: 'İş Emri',
  DELIVERY_NOTE: 'İrsaliye',
  OTHER: 'Kayıt',
};

const READABLE_VALUE_KEYS = ['name', 'number', 'title', 'subject', 'code', 'email', 'fileName'] as const;

type AuditFilterPresetKey = 'today' | 'critical' | 'changes' | 'exports';

interface AuditFilterPreset {
  key: AuditFilterPresetKey;
  label: string;
  description: string;
}

const FILTER_PRESETS: AuditFilterPreset[] = [
  { key: 'today', label: 'Bugun', description: 'Son gunun kayitlari' },
  { key: 'critical', label: 'Kritik', description: 'Silme, onay/red ve export' },
  { key: 'changes', label: 'Degisiklik', description: 'Guncelleme kayitlari' },
  { key: 'exports', label: 'Export', description: 'Disa aktarma olaylari' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === 'string' && field.trim() ? field.trim() : null;
}

function readNumberField(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === 'number' ? field : null;
}

function getReadableEntityName(log: AuditLog): string | null {
  if (log.entityLabel) return log.entityLabel;

  for (const source of [log.newValues, log.oldValues]) {
    for (const key of READABLE_VALUE_KEYS) {
      const value = readStringField(source, key);
      if (value) return value;
    }
  }
  return null;
}

function getActorLabel(log: AuditLog, userLabelById: Map<string, string>): string {
  if (log.userLabel) return log.userLabel;
  if (log.userId) return userLabelById.get(log.userId) ?? 'Bilinmeyen kullanıcı';
  if (log.module === 'api_keys') return 'API anahtarı';
  return 'Sistem';
}

function getActionLabel(log: AuditLog): string {
  if (log.business?.actionLabel) return log.business.actionLabel;
  const method = readStringField(log.newValues, 'method');
  const path = readStringField(log.newValues, 'path');
  const status = readNumberField(log.newValues, 'status');

  if (log.module === 'api_keys' && method && path) {
    return `API ${method}${status ? ` (${status})` : ''}`;
  }

  return ACTION_MAP[log.action]?.label ?? log.action;
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

function getEntityLabel(log: AuditLog): string {
  if (log.business?.entityTypeLabel) return log.business.entityTypeLabel;
  return ENTITY_LABELS[log.entityType] ?? log.entityType;
}

function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

function getBusinessModuleLabel(log: AuditLog): string {
  return log.business?.moduleLabel ?? getModuleLabel(log.module);
}

function getChangedFields(log: AuditLog): string[] {
  if (log.business?.changes.length) return log.business.changes.map((change) => change.label);
  const keys = new Set<string>();
  for (const source of [log.oldValues, log.newValues]) {
    if (!isRecord(source)) continue;
    Object.keys(source).forEach((key) => keys.add(key));
  }
  return Array.from(keys).slice(0, 8);
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCriticalLog(log: AuditLog): boolean {
  return log.isCritical === true;
}

function changedValue(value: string | null): string {
  return value ?? 'bos';
}

function DiffTable({ log }: { log: AuditLog }) {
  const changes = log.business?.changes ?? [];
  if (changes.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50">
      <div className="border-b border-slate-800 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">
        Degisiklik Diff Gorunumu
      </div>
      <div className="divide-y divide-slate-800">
        {changes.map((change) => (
          <div key={`${change.field}:${change.lineContext ?? 'root'}`} className="grid gap-3 px-3 py-2 text-xs md:grid-cols-[150px_1fr_1fr]">
            <div>
              <p className="font-medium text-slate-300">{change.label}</p>
              {change.lineContext && <p className="mt-0.5 text-[10px] text-slate-500">{change.lineContext}</p>}
            </div>
            <div className="rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1.5 text-red-200">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-red-300/70">Eski</span>
              {changedValue(change.oldValue)}
            </div>
            <div className="rounded-md border border-emerald-500/15 bg-emerald-500/5 px-2 py-1.5 text-emerald-200">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-emerald-300/70">Yeni</span>
              {changedValue(change.newValue)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JsonPreview({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;

  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{title}</p>
      <pre className="max-h-40 overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [activePreset, setActivePreset] = useState<AuditFilterPresetKey | null>(null);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const auditFilters = {
    module: moduleFilter || undefined,
    action: actionFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    criticalOnly: criticalOnly ? 'true' : undefined,
  };
  const { data, isLoading } = useAuditLogs({ page, limit: 30, ...auditFilters });
  const exportQuery = useAuditLogExport(auditFilters);
  const { data: tenantUsers = [] } = useTenantUsers();
  const userLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    tenantUsers.forEach((tenantUser) => {
      labels.set(tenantUser.userId, `${tenantUser.user.name} (${tenantUser.user.email})`);
      labels.set(tenantUser.user.id, `${tenantUser.user.name} (${tenantUser.user.email})`);
    });
    return labels;
  }, [tenantUsers]);

  const handleExport = async () => {
    const exported = await exportQuery.refetch();
    if (!exported.data) return;

    const blob = new Blob([JSON.stringify(exported.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (preset: AuditFilterPresetKey) => {
    setPage(1);
    setActivePreset(preset);
    setModuleFilter('');
    setActionFilter('');
    setDateFrom('');
    setDateTo('');
    setCriticalOnly(false);

    if (preset === 'today') {
      const today = todayInputValue();
      setDateFrom(today);
      setDateTo(today);
    }
    if (preset === 'critical') setCriticalOnly(true);
    if (preset === 'changes') setActionFilter('UPDATE');
    if (preset === 'exports') setActionFilter('EXPORT');
  };

  const clearFilters = () => {
    setPage(1);
    setActivePreset(null);
    setModuleFilter('');
    setActionFilter('');
    setDateFrom('');
    setDateTo('');
    setCriticalOnly(false);
  };

  const columns: ColumnDef<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'Tarih',
      width: '150px',
      render: (row) => <span className="text-xs tabular-nums text-slate-400">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'action',
      header: 'İşlem',
      width: '130px',
      render: (row) => {
        const action = ACTION_MAP[row.action];
        return action ? (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={action.variant}>{getActionLabel(row)}</Badge>
            {isCriticalLog(row) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300">
                <AlertTriangle className="h-3 w-3" />
                Kritik
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">{getActionLabel(row)}</span>
        );
      },
    },
    {
      key: 'user',
      header: 'Kullanıcı',
      width: '220px',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-300">{getActorLabel(row, userLabelById)}</p>
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Modül',
      width: '130px',
      render: (row) => <span className="text-xs text-slate-400">{getBusinessModuleLabel(row)}</span>,
    },
    {
      key: 'entity',
      header: 'Kayıt',
      render: (row) => {
        const readableName = getReadableEntityName(row);
        return (
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{getEntityLabel(row)}</Badge>
              <span className="max-w-[360px] truncate text-sm font-medium text-slate-200">
                {readableName ?? `${getEntityLabel(row)} kaydı`}
              </span>
            </div>
            <p className="line-clamp-2 text-xs text-slate-400">{row.business?.summary ?? 'İşlem kaydı oluşturuldu.'}</p>
            {row.business?.changes?.[0] && (
              <p className="mt-1 text-[11px] text-slate-500">
                {row.business.changes[0].label}: {row.business.changes[0].oldValue ?? 'boş'} → {row.business.changes[0].newValue ?? 'boş'}
              </p>
            )}
            <span className="mt-1 block font-mono text-[10px] text-slate-600">ID: {shortId(row.entityId)}</span>
          </div>
        );
      },
    },
    {
      key: 'detail',
      header: '',
      width: '60px',
      align: 'right',
      render: (row) => (
        <button
          onClick={(event) => {
            event.stopPropagation();
            setDetail(row);
          }}
          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-sky-500/10 hover:text-sky-400"
          aria-label="İşlem detayını aç"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Denetim Kaydı" subtitle="Paket limitlerine göre erişilebilir işlem geçmişi." />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Filter className="h-3.5 w-3.5 text-sky-400" />
          Filtre presetleri
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.key)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                activePreset === preset.key
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                  : 'border-slate-800 bg-slate-950/35 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="block text-xs font-semibold">{preset.label}</span>
              <span className="block text-[10px] text-slate-500">{preset.description}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
            Temizle
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={moduleFilter}
          onChange={(event) => {
            setModuleFilter(event.target.value);
            setActivePreset(null);
            setPage(1);
          }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">Tüm Modüller</option>
          {Object.entries(MODULE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(event) => {
            setActionFilter(event.target.value);
            setActivePreset(null);
            setCriticalOnly(false);
            setPage(1);
          }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">Tüm İşlemler</option>
          {Object.entries(ACTION_MAP).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            setActivePreset(null);
            setPage(1);
          }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            setActivePreset(null);
            setPage(1);
          }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <FeatureGate plan="PROFESSIONAL" fallback={null}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            loading={exportQuery.isFetching}
            onClick={handleExport}
          >
            Dışa Aktar
          </Button>
        </FeatureGate>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="Denetim kaydı bulunamadı"
        pagination={data ? { page, pageSize: 30, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      <Modal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title="İşlem Detayı" size="md">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">İşlem</span>
                <p className="font-medium text-slate-200">{getActionLabel(detail)}</p>
              </div>
              <div>
                <span className="text-slate-500">Modül</span>
                <p className="text-slate-200">{getBusinessModuleLabel(detail)}</p>
              </div>
              <div>
                <span className="text-slate-500">Kullanıcı</span>
                <p className="text-slate-200">{getActorLabel(detail, userLabelById)}</p>
              </div>
              <div>
                <span className="text-slate-500">Kayıt</span>
                <p className="text-slate-200">{getReadableEntityName(detail) ?? getEntityLabel(detail)}</p>
              </div>
              <div>
                <span className="text-slate-500">Tarih</span>
                <p className="text-slate-200">{formatDateTime(detail.createdAt)}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Kaynak ID</span>
                <p className="break-all font-mono text-[11px] text-slate-400">{detail.entityId}</p>
              </div>
              {detail.userId && (
                <div className="col-span-2">
                  <span className="text-slate-500">Kullanıcı ID</span>
                  <p className="break-all font-mono text-[11px] text-slate-400">{detail.userId}</p>
                </div>
              )}
            </div>

            {detail.business?.summary && (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-sky-300/80">İş özeti</p>
                <p className="mt-1 text-sm text-slate-100">{detail.business.summary}</p>
              </div>
            )}

            {isCriticalLog(detail) && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2">
                <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-300">
                  <AlertTriangle className="h-3 w-3" />
                  Kritik olay
                </p>
                <p className="mt-1 text-sm text-red-100">{detail.criticalReason ?? 'Bu kayit kritik olay olarak isaretlendi.'}</p>
              </div>
            )}

            <DiffTable log={detail} />

            {detail.business?.changes.length ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/50">
                <div className="border-b border-slate-800 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">Değişiklikler</div>
                <div className="divide-y divide-slate-800">
                  {detail.business.changes.map((change) => (
                    <div key={change.field} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2 text-xs">
                      <span className="font-medium text-slate-300">{change.label}</span>
                      <span className="text-slate-400">
                        {change.oldValue ?? 'boş'} <span className="text-slate-600">→</span> {change.newValue ?? 'boş'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : getChangedFields(detail).length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Alanlar</p>
                <p className="mt-1 text-xs text-slate-300">{getChangedFields(detail).join(', ')}</p>
              </div>
            )}

            <JsonPreview title="Eski Değerler" value={detail.oldValues} />
            <JsonPreview title="Yeni Değerler" value={detail.newValues} />
          </div>
        )}
      </Modal>
    </div>
  );
}
