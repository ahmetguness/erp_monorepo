'use client';

import { FileText, Palette } from 'lucide-react';
import { TenantLogo } from '@/components/shared/TenantLogo';
import { useTenantSettings, useUpsertTenantSetting } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';
import {
  DEFAULT_DOCUMENT_ACCENT,
  DEFAULT_DOCUMENT_TEMPLATE,
  DOCUMENT_ACCENT_KEY,
  DOCUMENT_ACCENT_OPTIONS,
  DOCUMENT_TEMPLATE_KEY,
  DOCUMENT_TEMPLATE_OPTIONS,
  isDocumentPdfAccent,
  isDocumentPdfTemplate,
  type DocumentPdfAccent,
  type DocumentPdfTemplate,
} from '@/lib/document-pdf-theme';

const ACCENT_SWATCH: Record<DocumentPdfAccent, string> = {
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  slate: 'bg-slate-500',
};

const ACCENT_PREVIEW: Record<DocumentPdfAccent, { border: string; background: string; text: string }> = {
  sky: { border: 'border-sky-500', background: 'bg-sky-500', text: 'text-sky-700' },
  emerald: { border: 'border-emerald-500', background: 'bg-emerald-500', text: 'text-emerald-700' },
  slate: { border: 'border-slate-500', background: 'bg-slate-500', text: 'text-slate-700' },
};

export function DocumentPdfThemeSettingsCard() {
  const { data: settings = [] } = useTenantSettings();
  const upsertTenant = useUpsertTenantSetting();
  const templateValue = settings.find((setting) => setting.key === DOCUMENT_TEMPLATE_KEY)?.value;
  const accentValue = settings.find((setting) => setting.key === DOCUMENT_ACCENT_KEY)?.value;
  const selectedTemplate = isDocumentPdfTemplate(templateValue) ? templateValue : DEFAULT_DOCUMENT_TEMPLATE;
  const selectedAccent = isDocumentPdfAccent(accentValue) ? accentValue : DEFAULT_DOCUMENT_ACCENT;

  function saveTemplate(value: DocumentPdfTemplate) {
    upsertTenant.mutate({ key: DOCUMENT_TEMPLATE_KEY, value });
  }

  function saveAccent(value: DocumentPdfAccent) {
    upsertTenant.mutate({ key: DOCUMENT_ACCENT_KEY, value });
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-violet-500/10 p-2">
          <FileText className="h-4 w-4 text-violet-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Fatura / teklif PDF teması</h2>
          <p className="mt-1 text-xs text-slate-500">Hazır şablon, şirket logosu ve vurgu rengi PDF olarak kaydet ekranlarında kullanılır.</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {DOCUMENT_TEMPLATE_OPTIONS.map((option) => {
          const selected = selectedTemplate === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={upsertTenant.isPending}
              onClick={() => saveTemplate(option.value)}
              className={cn(
                'min-h-28 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                selected ? 'border-violet-500/50 bg-violet-500/10' : 'border-slate-800 bg-slate-950/30 hover:border-slate-700',
              )}
            >
              <span className="block text-sm font-semibold text-slate-100">{option.label}</span>
              <span className="mt-2 block text-xs leading-5 text-slate-500">{option.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="mr-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Palette className="h-3.5 w-3.5" />
          Renk
        </div>
        {DOCUMENT_ACCENT_OPTIONS.map((option) => {
          const selected = selectedAccent === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={upsertTenant.isPending}
              onClick={() => saveAccent(option.value)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                selected ? 'border-slate-500 bg-slate-800 text-white' : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:border-slate-700',
              )}
            >
              <span className={cn('h-3 w-3 rounded-full', ACCENT_SWATCH[option.value])} />
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 border-t border-slate-800 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Canlı önizleme</h3>
            <p className="mt-0.5 text-xs text-slate-500">Tema ve renk seçiminiz örnek faturaya anında uygulanır.</p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
            {DOCUMENT_TEMPLATE_OPTIONS.find((option) => option.value === selectedTemplate)?.label}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:p-5">
          <div
            className={cn(
              'mx-auto max-w-2xl bg-white text-slate-800 shadow-2xl transition-all duration-200',
              selectedTemplate === 'compact' ? 'p-4 text-[9px]' : 'p-6 text-[10px] sm:p-8',
              selectedTemplate === 'modern' ? cn('border-l-8', ACCENT_PREVIEW[selectedAccent].border) : 'rounded-sm',
              selectedTemplate === 'classic' && cn('border-t-4', ACCENT_PREVIEW[selectedAccent].border),
            )}
          >
            <div className={cn('flex justify-between gap-5', selectedTemplate === 'compact' ? 'mb-4' : 'mb-7')}>
              <div className="flex items-center gap-3">
                <TenantLogo className="h-11 w-11 rounded border-slate-200 bg-white" fallbackClassName="text-slate-400" />
                <div>
                  <p className="text-sm font-bold text-slate-900">Şirketiniz</p>
                  <p className="mt-0.5 text-slate-500">Vergi No: 1234567890</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn('text-lg font-black tracking-tight', ACCENT_PREVIEW[selectedAccent].text)}>FATURA</p>
                <p className="mt-1 font-semibold">FTR-2026-0001</p>
                <p className="text-slate-500">04.09.2026</p>
              </div>
            </div>

            <div className={cn('grid grid-cols-2 gap-4 border-y border-slate-200 py-3', selectedTemplate === 'compact' && 'py-2')}>
              <div><p className="font-semibold text-slate-400">MÜŞTERİ</p><p className="mt-1 font-bold">Örnek Müşteri A.Ş.</p></div>
              <div className="text-right"><p className="font-semibold text-slate-400">VADE TARİHİ</p><p className="mt-1 font-bold">19.09.2026</p></div>
            </div>

            <div className={selectedTemplate === 'compact' ? 'mt-3' : 'mt-5'}>
              <div className={cn('grid grid-cols-[1fr_auto_auto] gap-3 px-2 py-2 font-bold text-white', ACCENT_PREVIEW[selectedAccent].background)}>
                <span>Açıklama</span><span>Miktar</span><span>Tutar</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-200 px-2 py-3">
                <span>Danışmanlık hizmeti</span><span>1</span><span>10.000,00 ₺</span>
              </div>
            </div>

            <div className={cn('ml-auto mt-4 w-48 space-y-2', selectedTemplate === 'compact' && 'mt-3')}>
              <div className="flex justify-between text-slate-500"><span>Ara toplam</span><span>10.000,00 ₺</span></div>
              <div className="flex justify-between text-slate-500"><span>KDV (%20)</span><span>2.000,00 ₺</span></div>
              <div className={cn('flex justify-between border-t-2 pt-2 text-sm font-black', ACCENT_PREVIEW[selectedAccent].border, ACCENT_PREVIEW[selectedAccent].text)}>
                <span>Genel toplam</span><span>12.000,00 ₺</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
