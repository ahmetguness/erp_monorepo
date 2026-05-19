'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Mail, Search, Tags } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { useDocumentCenter } from '@/hooks/useAttachments';
import { cn, formatDateTime } from '@/lib/utils';
import { downloadAttachment, type DocumentCenterCategory, type DocumentCenterItem, type DocumentCenterSource } from '@/services/attachment.service';

const PAGE_SIZE = 30;

const CATEGORY_LABELS: Record<DocumentCenterCategory, string> = {
  CUSTOMER: 'Müşteri dosyaları',
  EMPLOYEE: 'Personel evrakları',
  SALES: 'Fatura / teklif ekleri',
  PURCHASING: 'Satın alma',
  SERVICE: 'Servis dosyaları',
  INVENTORY: 'Stok / üretim',
  CONTRACT: 'Sözleşmeler',
  MAIL: 'Mail ekleri',
  OTHER: 'Diğer',
};

const CATEGORY_VARIANTS: Record<DocumentCenterCategory, BadgeVariant> = {
  CUSTOMER: 'info',
  EMPLOYEE: 'purple',
  SALES: 'success',
  PURCHASING: 'warning',
  SERVICE: 'neutral',
  INVENTORY: 'info',
  CONTRACT: 'danger',
  MAIL: 'purple',
  OTHER: 'neutral',
};

const SOURCE_LABELS: Record<DocumentCenterSource, string> = {
  ATTACHMENT: 'Dosya',
  MAIL: 'Mail eki',
};

const ENTITY_LABELS: Record<DocumentCenterItem['entityType'], string> = {
  INVOICE: 'Fatura',
  PRODUCT: 'Ürün',
  CATEGORY: 'Kategori',
  CONTACT: 'Cari',
  EMPLOYEE: 'Personel',
  CUSTOMER_ASSET: 'Müşteri varlığı',
  SERVICE_REQUEST: 'Servis talebi',
  PURCHASE_ORDER: 'Satın alma siparişi',
  SALES_ORDER: 'Satış siparişi',
  WORK_ORDER: 'İş emri',
  DELIVERY_NOTE: 'İrsaliye',
  OTHER: 'Kayıt',
  MAIL: 'Mail',
};

function formatFileSize(size: number | null): string {
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export function DocumentCenterPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DocumentCenterCategory | ''>('');
  const [source, setSource] = useState<DocumentCenterSource | ''>('');

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: search.trim() || undefined,
      category: category || undefined,
      source: source || undefined,
    }),
    [category, page, search, source],
  );

  const { data, isLoading } = useDocumentCenter(params);

  const handleDownload = async (item: DocumentCenterItem) => {
    if (item.source !== 'ATTACHMENT') return;
    const blob = await downloadAttachment(item.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<DocumentCenterItem>[] = [
    {
      key: 'file',
      header: 'Dosya',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            row.source === 'MAIL' ? 'border-violet-500/20 bg-violet-500/10 text-violet-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300',
          )}>
            {row.source === 'MAIL' ? <Mail className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{row.fileName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {row.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-md bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      width: '170px',
      render: (row) => <Badge variant={CATEGORY_VARIANTS[row.category]}>{CATEGORY_LABELS[row.category]}</Badge>,
    },
    {
      key: 'entity',
      header: 'Bağlı kayıt',
      width: '260px',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-200">{row.entityLabel ?? `${ENTITY_LABELS[row.entityType]} kaydı`}</p>
          <p className="mt-1 font-mono text-[10px] text-slate-600">{ENTITY_LABELS[row.entityType]} · {shortId(row.entityId)}</p>
        </div>
      ),
    },
    {
      key: 'uploader',
      header: 'Yükleyen',
      width: '220px',
      render: (row) => <span className="text-xs text-slate-400">{row.uploadedByLabel ?? 'Sistem'}</span>,
    },
    {
      key: 'meta',
      header: 'Boyut / Tarih',
      width: '150px',
      render: (row) => (
        <div>
          <p className="text-xs font-medium text-slate-300">{formatFileSize(row.fileSize)}</p>
          <p className="mt-1 text-[10px] text-slate-600">{formatDateTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          {row.href && (
            <Link
              href={row.href}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-sky-300"
              aria-label="Bağlı kayda git"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDownload(row);
            }}
            disabled={row.source !== 'ATTACHMENT'}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Dosyayı indir"
            title={row.source === 'MAIL' ? 'Mail ekleri geçmişte metadata olarak tutuluyor' : 'Dosyayı indir'}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const summary = data?.meta.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Doküman Merkezi"
        subtitle="Müşteri, personel, satış, servis ve mail eklerini tek merkezden takip edin."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatCard label="Toplam" value={String(summary?.totalDocuments ?? 0)} hint="Filtreye uyan kayıt" />
        <StatCard label="Dosyalar" value={String(summary?.attachmentCount ?? 0)} hint="İndirilebilir ekler" />
        <StatCard label="Mail ekleri" value={String(summary?.mailAttachmentCount ?? 0)} hint="Mail geçmişi metadata" />
        <StatCard label="Boyut" value={formatFileSize(summary?.totalSizeBytes ?? 0)} hint="Listelenen dosya hacmi" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Dosya adı, bağlı kayıt, yükleyen veya etiket ara"
              className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900/70 pl-9 pr-3 text-sm text-slate-200 outline-none transition focus:border-sky-500/50"
            />
          </label>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as DocumentCenterCategory | '');
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-200 outline-none transition focus:border-sky-500/50"
          >
            <option value="">Tüm kategoriler</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={source}
            onChange={(event) => {
              setSource(event.target.value as DocumentCenterSource | '');
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-200 outline-none transition focus:border-sky-500/50"
          >
            <option value="">Tüm kaynaklar</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="Doküman bulunamadı"
        emptyDescription="Filtreleri değiştirerek tekrar deneyin."
        pagination={data ? { page, pageSize: PAGE_SIZE, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/35 px-4 py-3 text-xs text-slate-500">
        <Tags className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
        <p>
          Kategoriler mevcut bağlı kayıt ve dosya adından otomatik türetilir. Mail ekleri geçmiş kaydı olarak görünür; fiziksel indirme sadece dosya merkezine yüklenen eklerde aktiftir.
        </p>
      </div>
    </div>
  );
}
