'use client';

import { useState } from 'react';
import { BrainCircuit, Loader2, Save, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAnalyzeBulkImport, useSaveMappingProfile } from '@/hooks/useBulkOperations';
import type { BulkOperationTarget, ImportAnalysis } from '@/services/bulk-operation.service';
import { parseDelimitedSample } from '@/domain/bulk-import/parse-delimited-sample';

const TARGETS: Array<{ value: BulkOperationTarget; label: string }> = [
  { value: 'contacts', label: 'Cari' }, { value: 'products', label: 'Ürün' }, { value: 'invoices', label: 'Fatura' },
];

function AnalysisSummary({ analysis }: { analysis: ImportAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Satır', analysis.summary.totalRows, 'neutral'], ['Otomatik düzeltme', analysis.summary.autoFixed, 'success'],
          ['İnceleme', analysis.summary.reviewRequired, 'warning'], ['Mükerrer adayı', analysis.summary.duplicateCandidates, 'danger'],
          ['Değişmeyen', analysis.summary.unchangedRows, 'info'],
        ].map(([label, value, variant]) => (
          <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="text-[10px] uppercase text-slate-500">{label}</p>
            <div className="mt-1"><Badge variant={variant as 'neutral' | 'success' | 'warning' | 'danger' | 'info'}>{String(value)}</Badge></div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <h4 className="text-sm font-semibold text-white">Kolon eşlemeleri</h4>
          <div className="mt-3 space-y-2">{analysis.mappings.map((mapping) => (
            <div key={mapping.source} className="flex items-center justify-between text-xs"><span className="text-slate-400">{mapping.source}</span><span className="text-slate-200">{mapping.target || 'Karar gerekli'} · %{Math.round(mapping.confidence * 100)} {mapping.learned && '· öğrenildi'}</span></div>
          ))}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <h4 className="text-sm font-semibold text-white">Çalıştırma planı</h4>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">Önerilen altyapı {analysis.execution.chunkSize} satırlık parçalarla arka planda çalışacak şekilde planlandı. Worker devreye alınmadan veri aktarımı başlatılmaz.</p>
          <div className="mt-3 flex gap-2"><Badge variant="warning">Worker bekleniyor</Badge><Badge variant="neutral">Planlama modu</Badge></div>
        </div>
      </div>
      {analysis.issues.length > 0 && <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-4">{analysis.issues.map((issue, index) => (
        <div key={`${issue.code}-${issue.row}-${index}`} className="flex gap-2 text-xs"><Badge variant={issue.severity === 'auto_fixed' ? 'success' : 'warning'}>{issue.severity === 'auto_fixed' ? 'Düzeltildi' : 'İncele'}</Badge><span className="text-slate-400">{issue.row > 0 ? `Satır ${issue.row}: ` : ''}{issue.message}</span></div>
      ))}</div>}
    </div>
  );
}

export function BulkImportAssistant({ canManage }: { canManage: boolean }) {
  const [target, setTarget] = useState<BulkOperationTarget>('contacts');
  const [sample, setSample] = useState('Cari Adı;Vergi No;E-posta;Şehir\nÖrnek Ltd;1234567890; info@example.com ;İstanbul');
  const [profileName, setProfileName] = useState('Varsayılan eşleme');
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const analyze = useAnalyzeBulkImport();
  const save = useSaveMappingProfile();
  const parsed = parseDelimitedSample(sample);

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 h-5 w-5 text-purple-400" /><div><h3 className="font-semibold text-white">Akıllı içe aktarma hazırlığı</h3><p className="mt-1 text-xs text-slate-500">Örnek veriden kolonları tanır, değerleri normalize eder ve yalnızca karar gereken satırları ayırır.</p></div></div>
      <div className="grid gap-4 lg:grid-cols-3"><Select label="Hedef" value={target} onChange={(event) => { setTarget(event.target.value as BulkOperationTarget); setAnalysis(null); }} options={TARGETS} /><Input label="Profil adı" value={profileName} onChange={(event) => setProfileName(event.target.value)} /><div className="flex items-end"><Badge variant="purple">İlk 100 satır güvenli önizleme</Badge></div></div>
      <div><label className="mb-2 block text-xs font-medium text-slate-400">CSV örneği</label><textarea value={sample} onChange={(event) => { setSample(event.target.value); setAnalysis(null); }} className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-500" /></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!canManage || parsed.headers.length === 0 || parsed.rows.length === 0 || analyze.isPending} leftIcon={analyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} onClick={() => analyze.mutate({ target, ...parsed }, { onSuccess: setAnalysis })}>Örneği analiz et</Button>
        <Button disabled={!canManage || !analysis || !profileName.trim() || save.isPending} leftIcon={save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} onClick={() => analysis && save.mutate({ name: profileName, target, headers: parsed.headers, mappings: analysis.mappings }, { onSuccess: (profile) => setAnalysis({ ...analysis, profile }) })}>Eşlemeyi öğren</Button>
      </div>
      {!canManage && <p className="text-xs text-amber-400">Analiz ve öğrenme için ayar oluşturma yetkisi gerekir.</p>}
      {analysis && <AnalysisSummary analysis={analysis} />}
    </section>
  );
}
