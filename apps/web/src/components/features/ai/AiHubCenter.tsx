'use client';

import { useState } from 'react';
import {
  Sparkles,
  Bot,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Mail,
  CreditCard,
  Zap,
  ArrowRight,
  ShieldCheck,
  Loader2,
  Building2,
  TrendingUp,
} from 'lucide-react';
import {
  useProcessInvoiceOcr,
  useExtractOrderFromEmail,
  useMatchPaymentDescription,
  useNlErpQuery,
  useExecuteAiSuggestion,
  useAiAnomalies,
} from '@/hooks/useAiAutomation';
import type { AiSuggestion } from '@/services/ai.automation.service';
import { cn } from '@/lib/utils';

interface AnomalyItem {
  type?: string;
  title?: string;
  riskLevel?: string;
  detail?: string;
}

function parseAnomalies(draftData: unknown): AnomalyItem[] {
  if (!Array.isArray(draftData)) return [];
  return draftData.filter((item): item is AnomalyItem => 
    typeof item === 'object' && item !== null && 'title' in item
  );
}

export function AiHubCenter() {
  const [nlPrompt, setNlPrompt] = useState('');
  const [nlResult, setNlResult] = useState<{ query: string; answerSummary: string; data: unknown } | null>(null);

  const [ocrText, setOcrText] = useState('');
  const [ocrSuggestion, setOcrSuggestion] = useState<AiSuggestion | null>(null);

  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSuggestion, setEmailSuggestion] = useState<AiSuggestion | null>(null);

  const nlQueryMutation = useNlErpQuery();
  const ocrMutation = useProcessInvoiceOcr();
  const emailMutation = useExtractOrderFromEmail();
  const executeMutation = useExecuteAiSuggestion();
  const { data: anomaliesSuggestion } = useAiAnomalies();

  const handleNlQuery = async () => {
    if (!nlPrompt.trim()) return;
    const res = await nlQueryMutation.mutateAsync(nlPrompt);
    setNlResult(res);
  };

  const handleOcrProcess = async () => {
    if (!ocrText.trim()) return;
    const res = await ocrMutation.mutateAsync(ocrText);
    setOcrSuggestion(res);
  };

  const handleEmailProcess = async () => {
    if (!emailSubject.trim() && !emailBody.trim()) return;
    const res = await emailMutation.mutateAsync({ subject: emailSubject, body: emailBody });
    setEmailSuggestion(res);
  };

  return (
    <div className="space-y-6">
      {/* AI Hub Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 p-6 border border-purple-900/40 shadow-2xl">
        <div className="absolute -top-10 -right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider">
              <Bot className="w-4 h-4 text-purple-400" />
              <span>Yapay Zeka Karar Destek & Otomasyon Katmanı</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Deterministik AI Karar Destek Stüdyosu
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Yapay zeka belirsizlik giderme, eşleştirme ve taslak üretimi yapar. Tüm kritik finansal işlemler kullanıcı onayı ve deterministik kurallarla icra edilir.
            </p>
          </div>

          <div className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold flex items-center gap-2 shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Onay ve Audit Garantili</span>
          </div>
        </div>
      </div>

      {/* Natural Language ERP Query Section */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Doğal Dille ERP Asistanına Sor</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Örn: Geçen ay vadesi geçen en yüksek 3 satış faturası hangileri?"
              value={nlPrompt}
              onChange={(e) => setNlPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNlQuery()}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>
          <button
            onClick={handleNlQuery}
            disabled={nlQueryMutation.isPending}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            {nlQueryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span>Analiz Et</span>
          </button>
        </div>

        {nlResult && (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              <span>Yapay Zeka Yanıt Özet:</span>
            </div>
            <p className="text-xs text-slate-300">{nlResult.answerSummary}</p>

            <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto">
              {JSON.stringify(nlResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Two Column Layout for OCR & Email Extraction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoice OCR Studio */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Fatura OCR & Taslak Üreteci</span>
            </div>
            <span className="text-[10px] text-sky-400 font-semibold uppercase">Fatura / Fiş Metni</span>
          </div>

          <textarea
            rows={4}
            placeholder="Fatura OCR metnini veya Fatura içeriğini buraya yapıştırın (Örn: VKN: 1234567890 Fatura No: FAT-2026-001 Genel Toplam: 15.400,00 TRY KDV: 2.566,67 TRY...)"
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-sky-500 font-mono"
          />

          <button
            onClick={handleOcrProcess}
            disabled={ocrMutation.isPending}
            className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
          >
            {ocrMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>OCR Metninden AI Taslağı Üret</span>
          </button>

          {ocrSuggestion && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{ocrSuggestion.summary}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Güven: %{Math.round(ocrSuggestion.confidenceScore * 100)}
                </span>
              </div>

              <div className="space-y-1">
                {ocrSuggestion.businessRulesValidation.checks.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                    {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <span className={c.ok ? 'text-slate-300' : 'text-amber-300'}>{c.message}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => executeMutation.mutate({ useCase: ocrSuggestion.useCase, draftData: ocrSuggestion.draftData })}
                disabled={executeMutation.isPending}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {executeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Onayla ve Alış Faturası Oluştur</span>
              </button>
            </div>
          )}
        </div>

        {/* Email Order Extraction */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Mail className="w-4 h-4 text-purple-400" />
              <span>E-Postadan Sipariş / Teklif Çıkarımı</span>
            </div>
            <span className="text-[10px] text-purple-400 font-semibold uppercase">Müşteri E-Postası</span>
          </div>

          <input
            type="text"
            placeholder="E-Posta Konusu (Örn: ABC A.Ş. 10 Adet PRD-001 Sipariş Talebi)"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
          />

          <textarea
            rows={2}
            placeholder="E-Posta Gövdesi..."
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
          />

          <button
            onClick={handleEmailProcess}
            disabled={emailMutation.isPending}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
          >
            {emailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            <span>E-Postadan Sipariş Kalemlerini Çıkar</span>
          </button>

          {emailSuggestion && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{emailSuggestion.summary}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Güven: %{Math.round(emailSuggestion.confidenceScore * 100)}
                </span>
              </div>

              <div className="space-y-1">
                {emailSuggestion.businessRulesValidation.checks.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                    {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <span className={c.ok ? 'text-slate-300' : 'text-amber-300'}>{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anomaly Detection Radar */}
      {anomaliesSuggestion && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Yapay Zeka Anomali & Risk Radarı</span>
            </div>
            <span className="text-[10px] text-rose-400 font-semibold uppercase">Otomatik Analiz</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {parseAnomalies(anomaliesSuggestion.draftData).map((anomaly: AnomalyItem, idx: number) => (
              <div key={idx} className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/30 text-xs space-y-1">
                <div className="font-bold text-rose-300 flex items-center justify-between">
                  <span>{anomaly.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200">{anomaly.riskLevel}</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">{anomaly.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
