'use client';

import { useState } from 'react';
import {
  Bot,
  Terminal,
  Send,
  Zap,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Play,
  ShieldCheck,
  Sparkles,
  GitCommit,
} from 'lucide-react';
import {
  useAdoptSuggestion,
  useExecutePlan,
  useParsePrompt,
  useWorkflowSuggestions,
} from '@/hooks/useAgentCommand';
import type { ParsedCommandPlan } from '@/services/agent.command.service';
import { cn } from '@/lib/utils';

export function AgentCommandCenter() {
  const [promptInput, setPromptInput] = useState('');
  const [currentPlan, setCurrentPlan] = useState<ParsedCommandPlan | null>(null);

  const parseMutation = useParsePrompt();
  const executeMutation = useExecutePlan();
  const suggestionsQuery = useWorkflowSuggestions();
  const adoptMutation = useAdoptSuggestion();

  const handleParsePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;

    const res = await parseMutation.mutateAsync(promptInput);
    setCurrentPlan(res);
  };

  const handleExecutePlan = async () => {
    if (!currentPlan) return;
    await executeMutation.mutateAsync(currentPlan.planId);
    setCurrentPlan((prev) =>
      prev
        ? {
            ...prev,
            steps: prev.steps.map((s) => ({ ...s, status: 'EXECUTED' })),
          }
        : null,
    );
  };

  const handleAdoptSuggestion = async (suggestionId: string) => {
    await adoptMutation.mutateAsync(suggestionId);
  };

  const suggestions = suggestionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 p-6 border border-blue-900/40 shadow-2xl">
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Bot className="w-4 h-4 text-blue-400" />
            <span className="text-blue-400">Akıllı Otonom ERP Ajanı & İcra Terminali</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Autonomous ERP Multi-Step Agent & Self-Correcting Workflows
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
            Doğal dille yazılan karmaşık çok adımlı ERP talimatları deterministik işlem zincirlerine ayrıştırılır ve güvenli biçimde icra edilir. Sık tekrarlanan süreçler otonom otomasyon kurallarına dönüştürülür.
          </p>
        </div>
      </div>

      {/* Natural Language Command Terminal */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-slate-800 pb-3">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span>Doğal Dil Çok Adımlı Komut Terminali (Agent Command Terminal)</span>
        </div>

        <form onSubmit={handleParsePrompt} className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Örn: Stokta 10 adetin altına düşen ürünler için en ucuz tedarikçiden satın alma siparişi oluştur..."
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={parseMutation.isPending || !promptInput.trim()}
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
          >
            {parseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>Komutu Analiz Et</span>
          </button>
        </form>

        {/* Quick Example Prompts */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-500">Örnek Komutlar:</span>
          <button
            type="button"
            onClick={() => setPromptInput('Önümüzdeki hafta vadesi gelen 50.000 TL üzeri alacaklar için hatırlatma maili taslağı hazırla')}
            className="px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
          >
            &quot;Vadesi gelen alacaklar için hatırlatma maili hazırla&quot;
          </button>
          <button
            type="button"
            onClick={() => setPromptInput('Kritik stok seviyesindeki ürünler için otonom satın alma siparişi üret')}
            className="px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
          >
            &quot;Kritik stoklar için otonom PO üret&quot;
          </button>
        </div>
      </div>

      {/* Execution Plan & Step Status Visualizer */}
      {currentPlan && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Ayrıştırılan Deterministik İşlem Zinciri ({currentPlan.planId})</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-black uppercase',
                  currentPlan.riskLevel === 'HIGH'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : currentPlan.riskLevel === 'MEDIUM'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                )}
              >
                Risk: {currentPlan.riskLevel}
              </span>
              <button
                onClick={handleExecutePlan}
                disabled={executeMutation.isPending}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {executeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>İşlem Zincirini İcra Et</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {currentPlan.steps.map((step) => (
              <div
                key={step.stepIndex}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-950 text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-800">
                    {step.stepIndex}
                  </span>
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{step.intent}</span>
                      <span className="text-[10px] text-slate-500 font-mono">[{step.targetEntity}]</span>
                    </div>
                    <div className="text-[11px] text-slate-400">{step.actionDescription}</div>
                  </div>
                </div>

                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1',
                    step.status === 'EXECUTED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400',
                  )}
                >
                  {step.status === 'EXECUTED' ? <CheckCircle2 className="w-3 h-3" /> : <GitCommit className="w-3 h-3" />}
                  <span>{step.status}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Self-Correcting Workflow Recommendations Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Kendi Kendine İyileşen İş Süreçleri (Self-Correcting Workflow Recommendations)</span>
          </div>
          <span className="text-[10px] text-blue-400 font-semibold uppercase">Proactive Rule Proposals</span>
        </div>

        {suggestionsQuery.isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Manuel Süreç Logları Analiz Ediliyor...</span>
          </div>
        ) : suggestions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {suggestions.map((s) => (
              <div key={s.suggestionId} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-white">{s.recommendedRuleName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Güven: %{s.confidencePct}
                  </span>
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="text-slate-400">Tetikleyici: <span className="text-slate-300">{s.triggerCondition}</span></div>
                  <div className="text-slate-400">Otomatik Aksiyon: <span className="text-emerald-400 font-bold">{s.actionToAutomate}</span></div>
                </div>

                <button
                  onClick={() => handleAdoptSuggestion(s.suggestionId)}
                  disabled={adoptMutation.isPending}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition-all flex items-center justify-center gap-1 shadow disabled:opacity-50"
                >
                  {adoptMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  <span>Otomasyon Kuralı Olarak Aktifleştir</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">Yeni otomasyon önerisi bulunamadı.</div>
        )}
      </div>
    </div>
  );
}
