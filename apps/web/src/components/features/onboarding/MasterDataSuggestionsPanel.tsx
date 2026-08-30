'use client';

import Link from 'next/link';
import { Check, DatabaseZap, ExternalLink, TriangleAlert } from 'lucide-react';
import type { MasterDataEnrichmentResult, MasterDataSuggestion } from '@/services/master-data-enrichment.service';

interface MasterDataSuggestionsPanelProps {
  result: MasterDataEnrichmentResult | undefined;
  onApply: (suggestion: MasterDataSuggestion) => void;
}

export function MasterDataSuggestionsPanel({ result, onApply }: MasterDataSuggestionsPanelProps) {
  if (!result || (result.suggestions.length === 0 && result.duplicates.length === 0 && result.warnings.length === 0)) return null;
  return (
    <section className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-sky-200"><DatabaseZap className="h-4 w-4" /> Ana veri önerileri</div>
      {result.warnings.map((warning) => <p key={warning} className="mt-2 flex gap-2 text-[11px] leading-4 text-amber-300"><TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />{warning}</p>)}
      {result.duplicates.map((duplicate) => (
        <Link key={duplicate.id} href={duplicate.href} className="mt-2 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-200">
          <span>Mevcut kayıt: {duplicate.label}</span><ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ))}
      <div className="mt-2 space-y-2">
        {result.suggestions.map((item) => (
          <div key={`${item.field}:${item.value}`} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-200">{item.field}: {item.value}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.sourceLabel} · %{Math.round(item.confidence * 100)} güven · {item.reason}</p>
            </div>
            <button type="button" title="Bu alanı uygula" onClick={() => onApply(item)} className="rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/10"><Check className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
