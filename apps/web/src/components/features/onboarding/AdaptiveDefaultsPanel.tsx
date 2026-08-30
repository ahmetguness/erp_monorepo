'use client';

import { BrainCircuit, Check, RotateCcw, X } from 'lucide-react';
import type { AdaptiveDefaultSuggestion } from '@/services/adaptive-defaults.service';

interface AdaptiveDefaultsPanelProps {
  suggestions: readonly AdaptiveDefaultSuggestion[];
  taxRateLabels: Readonly<Record<string, string>>;
  onApply: (suggestion: AdaptiveDefaultSuggestion) => void;
  onDismiss: (suggestion: AdaptiveDefaultSuggestion) => void;
  onReset: () => void;
}

const SOURCE_LABELS: Record<AdaptiveDefaultSuggestion['source'], string> = {
  contact: 'Cari tercihi',
  user: 'Kişisel örüntü',
  role: 'Rol örüntüsü',
  tenant: 'Şirket örüntüsü',
  policy: 'Kesin şirket kuralı',
};

function valueLabel(suggestion: AdaptiveDefaultSuggestion, taxRateLabels: Readonly<Record<string, string>>): string {
  return suggestion.field === 'paymentTermDays' ? `${suggestion.value} gün vade` : (taxRateLabels[suggestion.value] ?? 'KDV oranı');
}

export function AdaptiveDefaultsPanel({ suggestions, taxRateLabels, onApply, onDismiss, onReset }: AdaptiveDefaultsPanelProps) {
  if (suggestions.length === 0) return null;
  return (
    <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-violet-300" />
        <h3 className="text-xs font-semibold text-violet-200">Öğrenilen form önerileri</h3>
        <button type="button" onClick={onReset} className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"><RotateCcw className="h-3 w-3" /> Sıfırla</button>
      </div>
      <div className="mt-3 space-y-2">
        {suggestions.map((suggestion) => (
          <div key={suggestion.field} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200">{valueLabel(suggestion, taxRateLabels)}</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">{SOURCE_LABELS[suggestion.source]} · %{Math.round(suggestion.confidence * 100)} güven · {suggestion.reason}</p>
              </div>
              <button type="button" title="Uygula" onClick={() => onApply(suggestion)} className="rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/10"><Check className="h-3.5 w-3.5" /></button>
              <button type="button" title="Bir daha önerme" onClick={() => onDismiss(suggestion)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
