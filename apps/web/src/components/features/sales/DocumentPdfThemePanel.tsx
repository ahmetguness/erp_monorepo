'use client';

import { Download, Palette } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TenantLogo } from '@/components/shared/TenantLogo';
import { useTenantSettings } from '@/hooks/useSettings';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import {
  DEFAULT_DOCUMENT_ACCENT,
  DEFAULT_DOCUMENT_TEMPLATE,
  DOCUMENT_ACCENT_KEY,
  DOCUMENT_TEMPLATE_KEY,
  isDocumentPdfAccent,
  isDocumentPdfTemplate,
  type DocumentPdfAccent,
  type DocumentPdfTemplate,
} from '@/lib/document-pdf-theme';

interface PrintableLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount?: number;
  taxRate?: number;
  lineTotal: number;
  product?: { code?: string; name?: string };
}

interface DocumentPdfThemePanelProps {
  kind: 'invoice' | 'quote';
  number: string;
  contactName: string | undefined;
  contactTaxNumber?: string | null;
  date: string;
  dueDateLabel: string;
  dueDate?: string | null;
  notes?: string | null;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  lines: PrintableLine[];
}

const ACCENT_CLASS: Record<DocumentPdfAccent, { text: string; bg: string; border: string; print: string }> = {
  sky: { text: 'text-sky-300', bg: 'bg-sky-500/10', border: 'border-sky-500/25', print: '#0284c7' },
  emerald: { text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', print: '#059669' },
  slate: { text: 'text-slate-200', bg: 'bg-slate-800/80', border: 'border-slate-600', print: '#334155' },
};

function normalizeQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function titleForKind(kind: DocumentPdfThemePanelProps['kind']): string {
  return kind === 'invoice' ? 'Fatura' : 'Teklif';
}

function resolveTemplate(value: string | undefined): DocumentPdfTemplate {
  return isDocumentPdfTemplate(value) ? value : DEFAULT_DOCUMENT_TEMPLATE;
}

function resolveAccent(value: string | undefined): DocumentPdfAccent {
  return isDocumentPdfAccent(value) ? value : DEFAULT_DOCUMENT_ACCENT;
}

export function DocumentPdfThemePanel({
  kind,
  number,
  contactName,
  contactTaxNumber,
  date,
  dueDateLabel,
  dueDate,
  notes,
  totalNet,
  totalTax,
  totalGross,
  lines,
}: DocumentPdfThemePanelProps) {
  const { data: settings = [] } = useTenantSettings();
  const template = resolveTemplate(settings.find((setting) => setting.key === DOCUMENT_TEMPLATE_KEY)?.value);
  const accent = resolveAccent(settings.find((setting) => setting.key === DOCUMENT_ACCENT_KEY)?.value);
  const accentClass = ACCENT_CLASS[accent];
  const compact = template === 'compact';
  const modern = template === 'modern';

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .document-print-surface, .document-print-surface * { visibility: visible !important; }
          .document-print-surface {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
          }
          .document-no-print { display: none !important; }
        }
      `}</style>

      <div className="document-no-print mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Palette className={cn('h-4 w-4', accentClass.text)} />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">PDF tema onizleme</h2>
            <p className="text-xs text-slate-500">Ayarlar sayfasindaki sablon, logo ve renk ile yazdirilir.</p>
          </div>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => window.print()}>
          PDF Kaydet
        </Button>
      </div>

      <div
        className={cn(
          'document-print-surface overflow-hidden rounded-lg border bg-white text-slate-950 shadow-sm',
          compact ? 'p-5' : 'p-7',
          modern ? accentClass.border : 'border-slate-200',
        )}
        style={{ borderTop: modern ? `8px solid ${accentClass.print}` : undefined }}
      >
        <header className={cn('flex gap-5', compact ? 'items-center justify-between' : 'items-start justify-between')}>
          <div className="flex min-w-0 items-center gap-3">
            <TenantLogo className="h-14 w-14 rounded-lg border-slate-200 bg-white" fallbackClassName="text-slate-400" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Belge</p>
              <h3 className="truncate text-xl font-bold text-slate-950">{titleForKind(kind)}</h3>
            </div>
          </div>
          <div className={cn('rounded-lg px-4 py-3 text-right', modern ? accentClass.bg : 'bg-slate-100')}>
            <p className="text-xs text-slate-500">No</p>
            <p className="font-mono text-base font-bold text-slate-950">{number}</p>
          </div>
        </header>

        <section className={cn('grid gap-3 border-y border-slate-200', compact ? 'my-4 py-3 text-xs sm:grid-cols-3' : 'my-6 py-4 text-sm sm:grid-cols-3')}>
          <div>
            <p className="text-xs text-slate-500">Musteri</p>
            <p className="font-semibold text-slate-950">{contactName ?? '-'}</p>
            {contactTaxNumber && <p className="text-xs text-slate-500">VKN/TCKN {contactTaxNumber}</p>}
          </div>
          <div>
            <p className="text-xs text-slate-500">Tarih</p>
            <p className="font-semibold text-slate-950">{formatDate(date)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{dueDateLabel}</p>
            <p className="font-semibold text-slate-950">{dueDate ? formatDate(dueDate) : '-'}</p>
          </div>
        </section>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className={modern ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}>
              <th className="px-3 py-2 font-semibold">Aciklama</th>
              <th className="px-3 py-2 text-right font-semibold">Miktar</th>
              <th className="px-3 py-2 text-right font-semibold">Birim</th>
              <th className="px-3 py-2 text-right font-semibold">Isk.</th>
              <th className="px-3 py-2 text-right font-semibold">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-slate-200">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-950">{line.product?.name ?? line.description}</p>
                  {line.product?.code && <p className="text-[11px] text-slate-500">{line.product.code}</p>}
                </td>
                <td className="px-3 py-2 text-right">{normalizeQuantity(line.quantity)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(line.unitPrice)}</td>
                <td className="px-3 py-2 text-right">%{line.discount}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className={cn('mt-5 flex flex-col gap-4', compact ? 'sm:flex-row sm:items-start sm:justify-between' : 'sm:flex-row sm:items-end sm:justify-between')}>
          <div className="max-w-md text-xs text-slate-500">
            {notes ? <p>{notes}</p> : <p>Bu belge elektronik ortamda hazirlanmistir.</p>}
          </div>
          <div className="min-w-56 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex justify-between gap-4"><span>Net</span><strong>{formatCurrency(totalNet)}</strong></div>
            <div className="mt-1 flex justify-between gap-4"><span>KDV</span><strong>{formatCurrency(totalTax)}</strong></div>
            <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between gap-4 text-base">
              <span>Genel Toplam</span><strong style={{ color: accentClass.print }}>{formatCurrency(totalGross)}</strong>
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
}
