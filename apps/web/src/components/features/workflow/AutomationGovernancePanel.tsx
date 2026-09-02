'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAutomationGovernancePolicy, useUpdateAutomationGovernancePolicy } from '@/hooks/useAutomation';

export function AutomationGovernancePanel({ canEdit }: { canEdit: boolean }) {
  const { data: policy, isLoading } = useAutomationGovernancePolicy();
  const updatePolicy = useUpdateAutomationGovernancePolicy();
  if (isLoading || !policy) return <section className="rounded-2xl border border-slate-800 p-5 text-sm text-slate-500">Otomasyon güven politikası yükleniyor...</section>;
  return <GovernancePolicyForm key={`${policy.approvalThreshold}-${policy.minimumAutomaticConfidence}`} policy={policy} isSaving={updatePolicy.isPending} canEdit={canEdit} onSave={(value) => updatePolicy.mutate(value)} />;
}

function GovernancePolicyForm({ policy, isSaving, canEdit, onSave }: { policy: { approvalThreshold: number; minimumAutomaticConfidence: number }; isSaving: boolean; canEdit: boolean; onSave: (policy: { approvalThreshold: number; minimumAutomaticConfidence: number }) => void }) {
  const [threshold, setThreshold] = useState(String(policy.approvalThreshold));
  const [confidence, setConfidence] = useState(String(Math.round(policy.minimumAutomaticConfidence * 100)));

  const parsedThreshold = Number(threshold);
  const parsedConfidence = Number(confidence);
  const isValid = Number.isFinite(parsedThreshold) && parsedThreshold >= 0
    && Number.isFinite(parsedConfidence) && parsedConfidence >= 0 && parsedConfidence <= 100;

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-100">Tenant otomasyon güven politikası</h3>
          <p className="mt-1 text-xs text-slate-500">Eşiği aşan parasal etkiler veya güven sınırının altındaki kararlar otomatik çalışmak yerine onay ister.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="space-y-1 text-xs text-slate-400"><span>Parasal onay eşiği (TRY)</span><input value={threshold} disabled={!canEdit} onChange={(event) => setThreshold(event.target.value)} type="number" min="0" className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 disabled:opacity-60" /></label>
            <label className="space-y-1 text-xs text-slate-400"><span>Minimum otomatik güven (%)</span><input value={confidence} disabled={!canEdit} onChange={(event) => setConfidence(event.target.value)} type="number" min="0" max="100" className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 disabled:opacity-60" /></label>
            {canEdit ? <Button size="sm" disabled={!isValid} loading={isSaving} onClick={() => onSave({ approvalThreshold: parsedThreshold, minimumAutomaticConfidence: parsedConfidence / 100 })}>Politikayı kaydet</Button> : <span className="text-xs text-slate-500">Salt okunur</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
