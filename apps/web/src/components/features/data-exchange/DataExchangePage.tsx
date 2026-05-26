'use client';

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, ShieldCheck, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/shared/PageHeader';
import { useDataExport, useDataQualitySummary, useImportPreview, useTemplateDownload } from '@/hooks/useDataExchange';
import type { DataExchangeEntity } from '@/services/data-exchange.service';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { cn } from '@/lib/utils';

const ENTITIES: { value: DataExchangeEntity; label: string; description: string }[] = [
  { value: 'products', label: 'Urunler', description: 'Kod, ad, fiyat ve stok esigi' },
  { value: 'contacts', label: 'Cariler', description: 'Musteri/tedarikci temel kartlari' },
  { value: 'stock', label: 'Stok', description: 'Depo bazli miktar gorunumu' },
  { value: 'invoices', label: 'Faturalar', description: 'Fatura baslik bilgileri' },
];

const ENTITY_HELP: Record<DataExchangeEntity, { required: string[]; exported: string; note: string }> = {
  products: {
    required: ['code', 'name'],
    exported: 'Urun kodu, ad, barkod, satis fiyati, alis fiyati, minimum stok ve aktiflik bilgisi disari aktarilir.',
    note: 'Import onizleme urun kodu ve ad alanlarini zorunlu kontrol eder.',
  },
  contacts: {
    required: ['type', 'name'],
    exported: 'Cari tipi, kod, unvan, vergi bilgileri, e-posta, telefon, sehir, ulke ve aktiflik bilgisi disari aktarilir.',
    note: 'type alani musteri/tedarikci ayrimini tasir; dosyada bos birakilmamalidir.',
  },
  stock: {
    required: ['productCode', 'warehouseCode', 'quantity'],
    exported: 'Urun kodu/ad, depo kodu/ad ve depo bazli miktar bilgisi disari aktarilir.',
    note: 'Stok import onizleme urun-depo-miktar eslesmesini kontrol eder; kayit islemi henuz yapmaz.',
  },
  invoices: {
    required: ['number', 'type', 'contactName', 'date'],
    exported: 'Fatura numarasi, tip, durum, cari, tarih, vade, para birimi ve genel toplam disari aktarilir.',
    note: 'Fatura import onizleme baslik alanlarini kontrol eder; satir kalemleri bu ekranda yazilmaz.',
  },
};

const SEVERITY_VARIANT = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
} as const;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DataExchangePage() {
  const [entity, setEntity] = useState<DataExchangeEntity>('products');
  const [csv, setCsv] = useState('');
  const [mapping, setMapping] = useState<Partial<Record<string, string>>>({});
  const [partialImport, setPartialImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preview = useImportPreview();
  const template = useTemplateDownload();
  const dataExport = useDataExport();
  const quality = useDataQualitySummary();
  const { toast } = useUIStore();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
  }

  async function handleTemplate() {
    try {
      const blob = await template.mutateAsync(entity);
      downloadBlob(blob, `${entity}-template.csv`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleExport() {
    try {
      const blob = await dataExport.mutateAsync(entity);
      downloadBlob(blob, `${entity}-export.csv`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handlePreview() {
    try {
      await preview.mutateAsync({ entity, csv, mapping, partialImport });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const previewData = preview.data;
  const help = ENTITY_HELP[entity];
  const qualityData = quality.data;

  return (
    <div>
      <PageHeader
        title="Ice / Disa Aktarma"
        subtitle="CSV sablonu al, mevcut veriyi disa aktar veya import dosyasini kaydetmeden once dogrula."
        action={
          <>
            <Button variant="outline" leftIcon={<FileSpreadsheet className="h-4 w-4" />} loading={template.isPending} onClick={handleTemplate}>
              Sablon
            </Button>
            <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} loading={dataExport.isPending} onClick={handleExport}>
              Export
            </Button>
          </>
        }
      />

      <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Data Quality Center</h2>
            <p className="mt-1 text-xs text-slate-500">Eksik alan, duplicate ve operasyonel veri tutarlılığı kontrolleri.</p>
          </div>
          <Badge variant={qualityData && qualityData.criticalCount > 0 ? 'danger' : 'success'}>
            Skor: {qualityData ? qualityData.score : '-'}
          </Badge>
        </div>

        {quality.isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-slate-800/60" />)}
          </div>
        ) : qualityData ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Toplam sorun</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{qualityData.issueCount}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Kritik sorun</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{qualityData.criticalCount}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Son tarama</p>
                <p className="mt-1 text-sm font-medium text-slate-200">{new Date(qualityData.generatedAt).toLocaleString('tr-TR')}</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {qualityData.issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  Veri kalitesi için aktif sorun bulunmadı.
                </div>
              ) : qualityData.issues.map((issue) => (
                <div key={issue.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-300" />
                        <h3 className="truncate text-sm font-semibold text-slate-200">{issue.title}</h3>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{issue.description}</p>
                    </div>
                    <Badge variant={SEVERITY_VARIANT[issue.severity]}>{issue.count}</Badge>
                  </div>
                  {issue.sampleRecords.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {issue.sampleRecords.slice(0, 3).map((record) => (
                        <p key={record.id} className="truncate text-xs text-slate-500">{record.label} - {record.detail}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Kalite özeti alınamadı.</p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {ENTITIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setEntity(item.value);
                setMapping({});
                preview.reset();
              }}
              className={cn(
                'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                item.value === entity ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-800 bg-slate-900/50 hover:bg-slate-900',
              )}
            >
              <span className="block text-sm font-medium text-slate-200">{item.label}</span>
              <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
            </button>
          ))}

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Info className="h-4 w-4 text-sky-400" />
              Bu merkez ne yapar?
            </div>
            <div className="space-y-3 text-xs leading-5 text-slate-500">
              <p>Sablon butonu secili veri tipi icin bos CSV basligi indirir.</p>
              <p>Export butonu sadece yetkili oldugun tenant verisini CSV olarak indirir.</p>
              <p>Kontrol Et islemi dosyayi kaydetmez; kolonlari ve zorunlu alanlari onceden dogrular.</p>
            </div>
          </section>
        </aside>

        <main className="space-y-4">
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:col-span-2">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                Secili veri: {ENTITIES.find((item) => item.value === entity)?.label}
              </div>
              <p className="text-xs leading-5 text-slate-500">{help.exported}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{help.note}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <ShieldCheck className="h-4 w-4 text-sky-400" />
                Zorunlu kolonlar
              </div>
              <div className="flex flex-wrap gap-2">
                {help.required.map((column) => <Badge key={column} variant="info">{column}</Badge>)}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Import Onizleme</h2>
                <p className="mt-1 text-xs text-slate-500">Dosya veritabanina yazilmaz; kolon ve zorunlu alanlar kontrol edilir.</p>
              </div>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => { void handleFile(event.target.files?.[0]); }}
                />
                <Button variant="outline" leftIcon={<UploadCloud className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
                  Dosya Sec
                </Button>
                <Button loading={preview.isPending} onClick={handlePreview} disabled={!csv.trim()}>
                  Kontrol Et
                </Button>
              </div>
            </div>
            <textarea
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              rows={9}
              spellCheck={false}
              className="mt-4 w-full rounded-lg border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 outline-none focus:border-sky-500/60"
              placeholder="CSV icerigini buraya yapistir"
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {help.required.map((target) => (
                <label key={target} className="block">
                  <span className="text-xs font-medium text-slate-500">{target} kolon eşleştirmesi</span>
                  <input
                    value={mapping[target] ?? ''}
                    onChange={(event) => setMapping((current) => ({ ...current, [target]: event.target.value }))}
                    placeholder={target}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300 outline-none focus:border-sky-500/60"
                  />
                </label>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={partialImport}
                onChange={(event) => setPartialImport(event.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950"
              />
              Geçerli satırları kısmi import için hazırla
            </label>
          </section>

          {previewData && (
            <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="success">Gecerli: {previewData.validRows}</Badge>
                <Badge variant={previewData.invalidRows > 0 ? 'danger' : 'neutral'}>Hatali: {previewData.invalidRows}</Badge>
                <Badge variant={previewData.batchPlan.canImportValidRows ? 'success' : 'warning'}>
                  Batch: {previewData.batchPlan.canImportValidRows ? 'Hazır' : 'Bekliyor'}
                </Badge>
                {previewData.errors.map((error) => <Badge key={error} variant="danger">{error}</Badge>)}
              </div>
              <p className="mb-3 text-xs text-slate-500">{previewData.batchPlan.rollbackNote}</p>
              <div className="overflow-auto rounded-lg border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-950/60">
                    <tr>
                      <th className="w-20 px-3 py-2 text-left text-xs font-medium text-slate-500">Satir</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Durum</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Hatalar</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Uyarılar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {previewData.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-3 py-2 text-slate-400">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          <Badge variant={row.valid ? 'success' : 'danger'}>{row.valid ? 'Gecerli' : 'Hatali'}</Badge>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{row.errors.join(', ') || '-'}</td>
                        <td className="px-3 py-2 text-slate-400">{row.warnings.join(', ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
