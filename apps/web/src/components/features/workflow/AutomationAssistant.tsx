'use client';

import { useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, FlaskConical, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePreviewAutomationAssistant } from '@/hooks/useAutomation';
import type { CreateAutomationRuleDTO } from '@/services/intelligence.service';
import { AutomationDecisionCard } from './AutomationDecisionCard';

interface AutomationAssistantProps {
  isCreating: boolean;
  onCreateSuggestion: (draft: CreateAutomationRuleDTO) => void;
}

const EXAMPLES = [
  'Stok minimumun altına düşünce görev oluştur',
  'Vadesi geçen faturaları sorumluya bildir',
  'Yüksek tutarlı faturaları onaya gönder',
  'Düşük kâr marjlı ürünleri kontrol et',
];

export function AutomationAssistant({ isCreating, onCreateSuggestion }: AutomationAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const preview = usePreviewAutomationAssistant();
  const result = preview.data;

  return (
    <section className="space-y-4 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-sky-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-violet-500/15 p-2.5"><Bot className="h-5 w-5 text-violet-300" /></div>
        <div>
          <h3 className="font-semibold text-slate-100">İşinizi anlatın, güvenli otomasyon taslağı hazırlayalım</h3>
          <p className="mt-1 text-xs text-slate-400">Teknik tetikleyici seçmeden hedefinizi yazın. Önce tenant verinizde salt-okunur simülasyon yapılır; hiçbir kayıt değiştirilmez.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && prompt.trim()) preview.mutate(prompt.trim()); }}
          placeholder="Örn. Vadesi geçen faturaları sorumluya bildir"
          className="h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-4 text-sm text-slate-100 outline-none focus:border-violet-400"
        />
        <Button loading={preview.isPending} disabled={!prompt.trim()} onClick={() => preview.mutate(prompt.trim())}>
          <Sparkles className="h-4 w-4" /> Taslak ve etkiyi göster
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} onClick={() => { setPrompt(example); preview.mutate(example); }} className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-400 hover:border-violet-400/50 hover:text-violet-200">
            {example}
          </button>
        ))}
      </div>

      {result && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-slate-100">{result.interpretation}</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">%{Math.round(result.confidence * 100)} güven</span>
            </div>
            <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
              <div><span className="block text-slate-500">Tetikleyici</span>{result.draft.trigger}</div>
              <div><span className="block text-slate-500">Aksiyon</span>{result.draft.action}</div>
              <div><span className="block text-slate-500">Başlangıç modu</span>Öneri / pasif</div>
            </div>
            {result.conflicts.map((conflict) => (
              <div key={conflict.ruleId} className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-2.5 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" /><span><strong>{conflict.ruleName}:</strong> {conflict.reason}</span>
              </div>
            ))}
            <AutomationDecisionCard decision={result.decision} />
            <Button loading={isCreating} onClick={() => onCreateSuggestion(result.draft)}>
              Pasif öneri olarak oluştur
            </Button>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-sky-200"><FlaskConical className="h-4 w-4" /> Simülasyon</div>
            <p className="mt-3 text-3xl font-semibold text-white">{result.simulation.matchedCount}</p>
            <p className="text-xs text-slate-400">mevcut kayıt eşleşirdi</p>
            <ul className="mt-3 space-y-2 text-[11px] text-slate-400">
              {result.simulation.examples.map((item) => <li key={`${item.title}-${item.detail}`}><span className="text-slate-200">{item.title}</span><br />{item.detail}</li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
