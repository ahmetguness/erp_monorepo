'use client';

import { FileText, Palette } from 'lucide-react';
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
          <h2 className="text-sm font-semibold text-white">Fatura / teklif PDF temasi</h2>
          <p className="mt-1 text-xs text-slate-500">Hazir sablon, sirket logosu ve vurgu rengi PDF olarak kaydet ekranlarinda kullanilir.</p>
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
    </section>
  );
}
