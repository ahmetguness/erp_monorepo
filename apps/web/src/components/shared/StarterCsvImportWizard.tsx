'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useCommitStarterCsvImport, useStarterCsvImportPreview, useStarterCsvImportTemplate } from '@/hooks/useStarterImport';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import type { StarterCsvImportEntity } from '@/services/starter-import.service';

interface StarterCsvImportWizardProps {
  entity: StarterCsvImportEntity;
}

interface EntityCopy {
  title: string;
  description: string;
  rowLabel: string;
  primaryField: string;
  secondaryField: string;
  filename: string;
}

const ENTITY_COPY: Record<StarterCsvImportEntity, EntityCopy> = {
  products: {
    title: 'Urun CSV ice aktarim',
    description: 'Starter icin urunleri CSV ile hizlica kontrol edin, basit alan esleme ile gecerli satirlari kaydedin.',
    rowLabel: 'Urun',
    primaryField: 'name',
    secondaryField: 'code',
    filename: 'starter-products-import-template.csv',
  },
  contacts: {
    title: 'Cari CSV ice aktarim',
    description: 'Musteri ve tedarikci temel kartlarini CSV ile aktarirken alan eslemeyi sade tutun.',
    rowLabel: 'Cari',
    primaryField: 'name',
    secondaryField: 'code',
    filename: 'starter-contacts-import-template.csv',
  },
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsvHeaders(csv: string): string[] {
  const firstLine = csv.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return [];
  const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  return firstLine.split(delimiter).map((header) => header.replace(/^"|"$/g, '').trim()).filter(Boolean);
}

export function StarterCsvImportWizard({ entity }: StarterCsvImportWizardProps) {
  const copy = ENTITY_COPY[entity];
  const [csv, setCsv] = useState('');
  const [mapping, setMapping] = useState<Partial<Record<string, string>>>({});
  const [partialImport, setPartialImport] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const template = useStarterCsvImportTemplate();
  const preview = useStarterCsvImportPreview();
  const commit = useCommitStarterCsvImport();
  const { toast } = useUIStore();

  const previewData = preview.data;
  const sourceHeaders = previewData?.sourceHeaders ?? parseCsvHeaders(csv);
  const targetFields = previewData?.targetFields ?? Object.keys(mapping);
  const hasCsv = csv.trim().length > 0;
  const effectiveMapping = useMemo(() => {
    const fields = previewData?.targetFields ?? targetFields;
    return Object.fromEntries(fields.map((field) => [field, mapping[field] ?? field]));
  }, [mapping, previewData?.targetFields, targetFields]);
  const canCommit = Boolean(
    previewData
    && previewData.errors.length === 0
    && previewData.summary.importableRows > 0
    && (partialImport || previewData.summary.invalidRows === 0),
  );

  async function handleTemplate() {
    try {
      const blob = await template.mutateAsync(entity);
      downloadBlob(blob, copy.filename);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setMapping({});
    preview.reset();
  }

  async function handlePreview() {
    try {
      await preview.mutateAsync({ entity, csv, mapping: effectiveMapping, partialImport });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleCommit() {
    try {
      const result = await commit.mutateAsync({ entity, csv, mapping: effectiveMapping, partialImport });
      toast.success(`${result.createdCount} kayit kaydedildi, ${result.skippedCount} satir atlandi.`);
      setCsv('');
      setMapping({});
      preview.reset();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-sky-300" />
            <h2 className="text-sm font-semibold text-slate-200">{copy.title}</h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{copy.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} loading={template.isPending} onClick={handleTemplate}>
            Sablon
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<UploadCloud className="h-3.5 w-3.5" />} onClick={() => fileInputRef.current?.click()}>
            Dosya Sec
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,application/vnd.ms-excel"
            className="hidden"
            onChange={(event) => { void handleFile(event.target.files?.[0]); }}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <textarea
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setMapping({});
              preview.reset();
            }}
            className="h-40 w-full resize-y rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500/60"
            placeholder="CSV icerigini buraya yapistirin veya Dosya Sec ile yukleyin."
          />

          {sourceHeaders.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-300">Basit alan esleme</h3>
                <span className="text-[11px] text-slate-500">Kolon adlari ayniysa otomatik eslesir.</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(previewData?.targetFields ?? (entity === 'products'
                  ? ['code', 'name', 'unitCode', 'barcode', 'salesPrice', 'purchasePrice', 'minStockLevel', 'categoryName', 'taxRateName', 'description', 'isActive']
                  : ['type', 'code', 'name', 'taxNumber', 'taxOffice', 'email', 'phone', 'city', 'country', 'paymentTermDays', 'isActive']
                )).map((field) => (
                  <label key={field} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-400">{field}</span>
                    <select
                      value={mapping[field] ?? field}
                      onChange={(event) => {
                        setMapping((current) => ({ ...current, [field]: event.target.value }));
                        preview.reset();
                      }}
                      className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-sky-500/60"
                    >
                      <option value={field}>{field}</option>
                      <option value="">Esleme yok</option>
                      {sourceHeaders.map((header) => (
                        <option key={`${field}-${header}`} value={header}>{header}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={partialImport}
                onChange={(event) => setPartialImport(event.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              Hatali satirlari atla, gecerli satirlari aktar
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!hasCsv} loading={preview.isPending} onClick={handlePreview}>
                Kontrol Et
              </Button>
              <Button size="sm" disabled={!canCommit} loading={commit.isPending} onClick={handleCommit}>
                Ice Aktar
              </Button>
            </div>
          </div>

          {previewData && (
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <div className="grid grid-cols-[72px_1fr_110px] bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-500">
                <span>Satir</span>
                <span>{copy.rowLabel}</span>
                <span className="text-right">Durum</span>
              </div>
              <div className="max-h-72 overflow-auto divide-y divide-slate-800">
                {previewData.rows.slice(0, 80).map((row) => (
                  <div key={row.rowNumber} className="grid grid-cols-[72px_1fr_110px] gap-3 px-3 py-2 text-xs">
                    <span className="font-mono text-slate-500">{row.rowNumber}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-200">{row.values[copy.primaryField] || String(row.normalized?.[copy.primaryField] ?? '-')}</p>
                      <p className="truncate font-mono text-slate-500">{row.values[copy.secondaryField] || String(row.normalized?.[copy.secondaryField] ?? '-')}</p>
                      {row.errors.length > 0 && <p className="mt-1 text-red-300">{row.errors.join(' ')}</p>}
                      {row.errors.length === 0 && row.warnings.length > 0 && <p className="mt-1 text-amber-300">{row.warnings.join(' ')}</p>}
                    </div>
                    <div className="text-right">
                      <Badge variant={row.valid ? 'success' : 'danger'}>{row.valid ? 'Hazir' : 'Hata'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] text-slate-500">Toplam</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{previewData?.summary.totalRows ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] text-slate-500">Hazir</p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">{previewData?.summary.importableRows ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] text-slate-500">Kalan</p>
              <p className="mt-1 text-lg font-semibold text-sky-300">{previewData?.summary.remainingSlots ?? '-'}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-300">Kontrol listesi</h3>
            <div className="space-y-2">
              {previewData ? previewData.checklist.map((item) => (
                <div key={item.key} className="flex items-start gap-2">
                  {item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">{item.label}</p>
                    <p className={cn('text-[11px] leading-4', item.ok ? 'text-slate-500' : 'text-amber-200')}>{item.detail}</p>
                  </div>
                </div>
              )) : (
                <p className="text-xs leading-5 text-slate-500">CSV yukleyince kolon esleme, zorunlu alan, tekrar ve Starter limit kontrolleri burada gorunur.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
