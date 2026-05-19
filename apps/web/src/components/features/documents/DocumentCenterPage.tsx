'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download, Edit3, ExternalLink, FileText, Mail, Search, Shield, Tags, Upload } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useAttachmentEntityOptions, useDocumentCenter, useUpdateAttachmentMetadata, useUploadAttachment } from '@/hooks/useAttachments';
import { cn, formatDateTime } from '@/lib/utils';
import {
  downloadAttachment,
  type AttachmentEntityType,
  type DocumentCenterCategory,
  type DocumentCenterItem,
  type DocumentCenterSource,
  type DocumentConfidentiality,
  type DocumentKind,
} from '@/services/attachment.service';

const PAGE_SIZE = 30;

const CATEGORIES: ReadonlyArray<{ value: DocumentCenterCategory; label: string; variant: BadgeVariant }> = [
  { value: 'CUSTOMER', label: 'Müşteri dosyaları', variant: 'info' },
  { value: 'EMPLOYEE', label: 'Personel evrakları', variant: 'purple' },
  { value: 'SALES', label: 'Fatura / teklif ekleri', variant: 'success' },
  { value: 'PURCHASING', label: 'Satın alma', variant: 'warning' },
  { value: 'SERVICE', label: 'Servis dosyaları', variant: 'neutral' },
  { value: 'INVENTORY', label: 'Stok / üretim', variant: 'info' },
  { value: 'CONTRACT', label: 'Sözleşmeler', variant: 'danger' },
  { value: 'MAIL', label: 'Mail ekleri', variant: 'purple' },
  { value: 'OTHER', label: 'Diğer', variant: 'neutral' },
];

const SOURCES: ReadonlyArray<{ value: DocumentCenterSource; label: string }> = [
  { value: 'ATTACHMENT', label: 'Dosya' },
  { value: 'MAIL', label: 'Mail eki' },
];

const UPLOAD_ENTITY_TYPES: ReadonlyArray<{ value: AttachmentEntityType; label: string }> = [
  { value: 'CONTACT', label: 'Cari / müşteri' },
  { value: 'EMPLOYEE', label: 'Personel' },
  { value: 'INVOICE', label: 'Fatura' },
  { value: 'SALES_QUOTE', label: 'Teklif' },
  { value: 'SALES_ORDER', label: 'Satış siparişi' },
  { value: 'PURCHASE_ORDER', label: 'Satın alma siparişi' },
  { value: 'PRODUCT', label: 'Ürün' },
  { value: 'SERVICE_REQUEST', label: 'Servis talebi' },
  { value: 'WORK_ORDER', label: 'İş emri' },
  { value: 'DELIVERY_NOTE', label: 'İrsaliye' },
  { value: 'CUSTOMER_ASSET', label: 'Müşteri varlığı' },
];

const DOCUMENT_KINDS: ReadonlyArray<{ value: DocumentKind; label: string }> = [
  { value: 'GENERAL', label: 'Genel dosya' },
  { value: 'EMPLOYEE_DOCUMENT', label: 'Personel evrakı' },
  { value: 'CONTRACT', label: 'Sözleşme' },
];

const CONFIDENTIALITIES: ReadonlyArray<{ value: DocumentConfidentiality; label: string }> = [
  { value: 'PUBLIC', label: 'Genel' },
  { value: 'INTERNAL', label: 'Şirket içi' },
  { value: 'CONFIDENTIAL', label: 'Gizli' },
];

const ENTITY_LABELS: Record<DocumentCenterItem['entityType'], string> = {
  INVOICE: 'Fatura',
  PRODUCT: 'Ürün',
  CATEGORY: 'Kategori',
  CONTACT: 'Cari',
  EMPLOYEE: 'Personel',
  CUSTOMER_ASSET: 'Müşteri varlığı',
  SERVICE_REQUEST: 'Servis talebi',
  PURCHASE_ORDER: 'Satın alma siparişi',
  SALES_QUOTE: 'Teklif',
  SALES_ORDER: 'Satış siparişi',
  WORK_ORDER: 'İş emri',
  DELIVERY_NOTE: 'İrsaliye',
  OTHER: 'Kayıt',
  MAIL: 'Mail',
};

function labelForCategory(value: DocumentCenterCategory): string {
  return CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

function variantForCategory(value: DocumentCenterCategory): BadgeVariant {
  return CATEGORIES.find((item) => item.value === value)?.variant ?? 'neutral';
}

function labelForDocumentKind(value: DocumentKind | null): string | null {
  if (!value) return null;
  return DOCUMENT_KINDS.find((item) => item.value === value)?.label ?? value;
}

function labelForConfidentiality(value: DocumentConfidentiality | null): string | null {
  if (!value) return null;
  return CONFIDENTIALITIES.find((item) => item.value === value)?.label ?? value;
}

function isCategory(value: string): value is DocumentCenterCategory {
  return CATEGORIES.some((item) => item.value === value);
}

function isSource(value: string): value is DocumentCenterSource {
  return SOURCES.some((item) => item.value === value);
}

function isUploadEntityType(value: string): value is AttachmentEntityType {
  return UPLOAD_ENTITY_TYPES.some((item) => item.value === value);
}

function isDocumentKind(value: string): value is DocumentKind {
  return DOCUMENT_KINDS.some((item) => item.value === value);
}

function isConfidentiality(value: string): value is DocumentConfidentiality {
  return CONFIDENTIALITIES.some((item) => item.value === value);
}

function formatFileSize(size: number | null): string {
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

function tagsFromInput(value: string): string[] {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
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

interface UploadFormState {
  entityType: AttachmentEntityType;
  entityId: string;
  entitySearch: string;
  file: File | null;
  category: DocumentCenterCategory;
  tags: string;
  documentKind: DocumentKind;
  confidentiality: DocumentConfidentiality;
  validFrom: string;
  validUntil: string;
  version: string;
}

const DEFAULT_UPLOAD_FORM: UploadFormState = {
  entityType: 'CONTACT',
  entityId: '',
  entitySearch: '',
  file: null,
  category: 'OTHER',
  tags: '',
  documentKind: 'GENERAL',
  confidentiality: 'INTERNAL',
  validFrom: '',
  validUntil: '',
  version: '1',
};

interface EditFormState {
  id: string;
  fileName: string;
  category: DocumentCenterCategory;
  tags: string;
  documentKind: DocumentKind;
  confidentiality: DocumentConfidentiality;
  validFrom: string;
  validUntil: string;
  version: string;
}

function dateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function DocumentCenterPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DocumentCenterCategory | ''>('');
  const [source, setSource] = useState<DocumentCenterSource | ''>('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(DEFAULT_UPLOAD_FORM);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

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
  const upload = useUploadAttachment();
  const updateMetadata = useUpdateAttachmentMetadata();
  const { data: entityOptions = [] } = useAttachmentEntityOptions(uploadForm.entityType, uploadForm.entitySearch.trim() || undefined);

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

  const submitUpload = async () => {
    if (!uploadForm.file || !uploadForm.entityId) return;
    await upload.mutateAsync({
      entityType: uploadForm.entityType,
      entityId: uploadForm.entityId,
      file: uploadForm.file,
      metadata: {
        category: uploadForm.category,
        tags: tagsFromInput(uploadForm.tags),
        documentKind: uploadForm.documentKind,
        confidentiality: uploadForm.confidentiality,
        validFrom: uploadForm.validFrom || null,
        validUntil: uploadForm.validUntil || null,
        version: Number.parseInt(uploadForm.version, 10) || 1,
      },
    });
    setUploadForm(DEFAULT_UPLOAD_FORM);
    setIsUploadOpen(false);
  };

  const startEdit = (item: DocumentCenterItem) => {
    if (item.source !== 'ATTACHMENT') return;
    setEditForm({
      id: item.id,
      fileName: item.fileName,
      category: item.category,
      tags: item.tags.join(', '),
      documentKind: item.documentKind ?? 'GENERAL',
      confidentiality: item.confidentiality ?? 'INTERNAL',
      validFrom: dateInputValue(item.validFrom),
      validUntil: dateInputValue(item.validUntil),
      version: String(item.version ?? 1),
    });
  };

  const submitEdit = async () => {
    if (!editForm) return;
    await updateMetadata.mutateAsync({
      id: editForm.id,
      fileName: editForm.fileName,
      category: editForm.category,
      tags: tagsFromInput(editForm.tags),
      documentKind: editForm.documentKind,
      confidentiality: editForm.confidentiality,
      validFrom: editForm.validFrom || null,
      validUntil: editForm.validUntil || null,
      version: Number.parseInt(editForm.version, 10) || 1,
    });
    setEditForm(null);
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
              {row.tags.slice(0, 4).map((tag) => (
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
      width: '180px',
      render: (row) => (
        <div className="space-y-1.5">
          <Badge variant={variantForCategory(row.category)}>{labelForCategory(row.category)}</Badge>
          {row.documentKind && <p className="text-[10px] text-slate-500">{labelForDocumentKind(row.documentKind)}</p>}
        </div>
      ),
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
      key: 'governance',
      header: 'Yetki / geçerlilik',
      width: '190px',
      render: (row) => (
        <div className="space-y-1">
          <p className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Shield className="h-3 w-3 text-slate-600" />
            {labelForConfidentiality(row.confidentiality) ?? 'Belirtilmedi'}
          </p>
          {row.validUntil && (
            <p className={cn('text-[10px]', row.isExpired ? 'text-red-300' : row.expiresSoon ? 'text-amber-300' : 'text-slate-600')}>
              {row.isExpired ? 'Süresi doldu' : row.expiresSoon ? 'Yakında dolacak' : 'Geçerli'} · {formatDateTime(row.validUntil)}
            </p>
          )}
          {row.version && <p className="text-[10px] text-slate-600">v{row.version}</p>}
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
      width: '140px',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          {row.source === 'ATTACHMENT' && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                startEdit(row);
              }}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-amber-300"
              aria-label="Dosya bilgilerini düzenle"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
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
        action={<Button leftIcon={<Upload className="h-4 w-4" />} onClick={() => setIsUploadOpen(true)}>Yeni dosya yükle</Button>}
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
              const next = event.target.value;
              setCategory(isCategory(next) ? next : '');
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-200 outline-none transition focus:border-sky-500/50"
          >
            <option value="">Tüm kategoriler</option>
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <select
            value={source}
            onChange={(event) => {
              const next = event.target.value;
              setSource(isSource(next) ? next : '');
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-200 outline-none transition focus:border-sky-500/50"
          >
            <option value="">Tüm kaynaklar</option>
            {SOURCES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
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
          Yeni dosyalar doğrudan buradan yüklenebilir, kategori ve etiketleri sonradan düzenlenebilir. Mail ekleri geçmiş kaydı olarak görünür; fiziksel indirme sadece dosya merkezine yüklenen eklerde aktiftir.
        </p>
      </div>

      <Modal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Yeni dosya yükle"
        description="Dosyayı bir ERP kaydına bağlayın, kategori ve erişim bilgisini belirleyin."
        size="xl"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setIsUploadOpen(false)}>Vazgeç</Button>
            <Button onClick={() => void submitUpload()} loading={upload.isPending} disabled={!uploadForm.file || !uploadForm.entityId}>Yükle</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Dosya"
            type="file"
            onChange={(event) => setUploadForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
            required
          />
          <Select
            label="Bağlı kayıt tipi"
            value={uploadForm.entityType}
            options={UPLOAD_ENTITY_TYPES.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(event) => {
              const next = event.target.value;
              if (!isUploadEntityType(next)) return;
              setUploadForm((current) => ({ ...current, entityType: next, entityId: '', entitySearch: '' }));
            }}
          />
          <Input
            label="Kayıt ara"
            value={uploadForm.entitySearch}
            onChange={(event) => setUploadForm((current) => ({ ...current, entitySearch: event.target.value }))}
            placeholder="İsim, numara veya kod"
          />
          <Select
            label="Bağlı kayıt"
            value={uploadForm.entityId}
            options={entityOptions.map((option) => ({ value: option.id, label: option.detail ? `${option.label} · ${option.detail}` : option.label }))}
            placeholder="Kayıt seç"
            onChange={(event) => setUploadForm((current) => ({ ...current, entityId: event.target.value }))}
            required
          />
          <Select
            label="Kategori"
            value={uploadForm.category}
            options={CATEGORIES.filter((item) => item.value !== 'MAIL').map((item) => ({ value: item.value, label: item.label }))}
            onChange={(event) => {
              const next = event.target.value;
              if (isCategory(next)) setUploadForm((current) => ({ ...current, category: next }));
            }}
          />
          <Input
            label="Etiketler"
            value={uploadForm.tags}
            onChange={(event) => setUploadForm((current) => ({ ...current, tags: event.target.value }))}
            placeholder="sözleşme, 2026, kritik"
            helperText="Virgülle ayırabilirsiniz."
          />
          <Select
            label="Doküman tipi"
            value={uploadForm.documentKind}
            options={DOCUMENT_KINDS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(event) => {
              const next = event.target.value;
              if (isDocumentKind(next)) setUploadForm((current) => ({ ...current, documentKind: next }));
            }}
          />
          <Select
            label="Gizlilik"
            value={uploadForm.confidentiality}
            options={CONFIDENTIALITIES.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(event) => {
              const next = event.target.value;
              if (isConfidentiality(next)) setUploadForm((current) => ({ ...current, confidentiality: next }));
            }}
          />
          <Input label="Başlangıç tarihi" type="date" value={uploadForm.validFrom} onChange={(event) => setUploadForm((current) => ({ ...current, validFrom: event.target.value }))} />
          <Input label="Bitiş / geçerlilik tarihi" type="date" value={uploadForm.validUntil} onChange={(event) => setUploadForm((current) => ({ ...current, validUntil: event.target.value }))} />
          <Input label="Versiyon" type="number" min={1} max={999} value={uploadForm.version} onChange={(event) => setUploadForm((current) => ({ ...current, version: event.target.value }))} />
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(editForm)}
        onClose={() => setEditForm(null)}
        title="Dosya bilgilerini düzenle"
        description="Kategori, etiket, gizlilik ve geçerlilik bilgilerini güncelleyin."
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditForm(null)}>Vazgeç</Button>
            <Button onClick={() => void submitEdit()} loading={updateMetadata.isPending} disabled={!editForm?.fileName.trim()}>Kaydet</Button>
          </>
        )}
      >
        {editForm && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Dosya adı" value={editForm.fileName} onChange={(event) => setEditForm((current) => current ? { ...current, fileName: event.target.value } : current)} />
            <Select
              label="Kategori"
              value={editForm.category}
              options={CATEGORIES.filter((item) => item.value !== 'MAIL').map((item) => ({ value: item.value, label: item.label }))}
              onChange={(event) => {
                const next = event.target.value;
                if (isCategory(next)) setEditForm((current) => current ? { ...current, category: next } : current);
              }}
            />
            <Input
              label="Etiketler"
              value={editForm.tags}
              onChange={(event) => setEditForm((current) => current ? { ...current, tags: event.target.value } : current)}
              helperText="Virgülle ayırabilirsiniz."
            />
            <Select
              label="Doküman tipi"
              value={editForm.documentKind}
              options={DOCUMENT_KINDS.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(event) => {
                const next = event.target.value;
                if (isDocumentKind(next)) setEditForm((current) => current ? { ...current, documentKind: next } : current);
              }}
            />
            <Select
              label="Gizlilik"
              value={editForm.confidentiality}
              options={CONFIDENTIALITIES.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(event) => {
                const next = event.target.value;
                if (isConfidentiality(next)) setEditForm((current) => current ? { ...current, confidentiality: next } : current);
              }}
            />
            <Input label="Versiyon" type="number" min={1} max={999} value={editForm.version} onChange={(event) => setEditForm((current) => current ? { ...current, version: event.target.value } : current)} />
            <Input label="Başlangıç tarihi" type="date" value={editForm.validFrom} onChange={(event) => setEditForm((current) => current ? { ...current, validFrom: event.target.value } : current)} />
            <Input label="Bitiş / geçerlilik tarihi" type="date" value={editForm.validUntil} onChange={(event) => setEditForm((current) => current ? { ...current, validUntil: event.target.value } : current)} />
          </div>
        )}
      </Modal>
    </div>
  );
}
