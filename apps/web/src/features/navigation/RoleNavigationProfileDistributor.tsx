'use client';

import { useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { useDistributeNavigationProfile, useNavigationWorkspace } from './useNavigationWorkspace';
import type { NavigationPersona } from './navigation-workspace.service';

const PERSONAS: Array<{ value: NavigationPersona; label: string }> = [
  { value: 'AUTO', label: 'Yetkilere göre otomatik' }, { value: 'SALES', label: 'Satış' },
  { value: 'FINANCE', label: 'Finans' }, { value: 'OPERATIONS', label: 'Operasyon' },
  { value: 'PEOPLE', label: 'İnsan & ekip' }, { value: 'MANAGEMENT', label: 'Yönetim' },
];

export function RoleNavigationProfileDistributor({ roleId, readableModules }: { roleId: string; readableModules: string[] }) {
  const { data: workspace } = useNavigationWorkspace();
  const distribute = useDistributeNavigationProfile();
  const toast = useUIStore((state) => state.toast);
  const [persona, setPersona] = useState<NavigationPersona>('AUTO');
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const modules = useMemo(() => [...new Set(readableModules)].sort(), [readableModules]);
  if (!workspace?.canDistributeProfiles) return null;

  return (
    <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <h4 className="text-sm font-semibold text-violet-100">Rol çalışma alanı profili</h4>
      <p className="mt-1 text-xs text-slate-500">Bu role atanmış aktif kullanıcıların menüsünü ortak bir başlangıç profiline getirir.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <label className="text-xs text-slate-400">Persona
          <select value={persona} onChange={(event) => setPersona(event.target.value as NavigationPersona)} className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-white">
            {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div><p className="text-xs text-slate-400">Başlangıçta gizlenecek alanlar</p><div className="mt-1 flex flex-wrap gap-2">{modules.map((module) => <label key={module} className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" checked={hiddenModules.includes(module)} onChange={() => setHiddenModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module])} />{module}</label>)}</div></div>
        <Button size="sm" leftIcon={<Send className="h-3.5 w-3.5" />} loading={distribute.isPending} onClick={() => distribute.mutate({ roleId, input: { persona, hiddenModules, favoriteHrefs: [] } }, { onSuccess: (count) => toast.success(`Menü profili ${count} kullanıcıya uygulandı.`), onError: (error) => toast.error(getErrorMessage(error)) })}>Dağıt</Button>
      </div>
    </section>
  );
}
