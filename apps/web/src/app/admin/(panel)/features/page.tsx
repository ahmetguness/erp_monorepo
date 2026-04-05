'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sliders } from 'lucide-react';
import { getPlanFeatures, type PlanFeature } from '@/services/admin.service';
import { cn } from '@/lib/utils';

const PLAN_COLORS: Record<string, string> = {
  STARTER: 'text-sky-400 bg-sky-500/10',
  PROFESSIONAL: 'text-violet-400 bg-violet-500/10',
  ENTERPRISE: 'text-amber-400 bg-amber-500/10',
};

export default function AdminFeaturesPage() {
  const [planFilter, setPlanFilter] = useState('');
  const { data: features = [], isLoading } = useQuery({
    queryKey: ['admin', 'features', planFilter],
    queryFn: () => getPlanFeatures(planFilter || undefined),
  });

  const grouped = features.reduce<Record<string, PlanFeature[]>>((acc, f) => {
    (acc[f.plan] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Plan Özellikleri</h1>
        <p className="text-sm text-slate-500">Plan bazlı limit ve özellik tanımları.</p>
      </div>

      <div className="flex gap-2">
        {['', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map((p) => (
          <button key={p} onClick={() => setPlanFilter(p)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              planFilter === p ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'border-transparent text-slate-500 hover:text-slate-300')}>
            {p || 'Tümü'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-600">Yükleniyor…</div>
      ) : (
        Object.entries(grouped).map(([plan, items]) => (
          <div key={plan} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-2">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', PLAN_COLORS[plan])}>{plan}</span>
              <span className="text-[10px] text-slate-600">{items.length} özellik</span>
            </div>
            <div className="divide-y divide-slate-800/40">
              {items.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-xs font-mono text-slate-400 w-40">{f.key}</span>
                  <span className="text-sm text-white flex-1">{f.value}</span>
                  <span className="text-[10px] text-slate-600">{f.type}</span>
                  <span className={cn('w-2 h-2 rounded-full', f.isEnabled ? 'bg-emerald-400' : 'bg-slate-600')} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
